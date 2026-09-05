/**
 * CampusVault - Cloudflare Worker Backend
 * 
 * Bindings required in Cloudflare Dashboard or wrangler.jsonc:
 * - D1 Database: env.DB
 * - R2 Bucket: env.BUCKET
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return handleCors();
    }

    try {
      // Check D1 binding
      if (!env.DB) {
        return jsonResponse({
          error: "Cloudflare D1 Database binding 'DB' is missing! Go to Cloudflare Worker Settings > Bindings, add D1 Database binding with variable name 'DB' linked to 'campusvault-db'."
        }, 500);
      }

      // Route: GET /api/materials (Fetch all materials)
      if (request.method === "GET" && pathname === "/api/materials") {
        const query = `
          SELECT 
            id, title, type, author, college, subject, description, date, fileName, 
            rating_sum, rating_count 
          FROM materials 
          ORDER BY id DESC
        `;
        const { results } = await env.DB.prepare(query).all();
        return jsonResponse(results || []);
      }

      // Route: POST /api/upload (Upload PDF to R2 OR receive Firebase fileUrl, then save to D1)
      if (request.method === "POST" && pathname === "/api/upload") {
        const formData = await request.formData();

        const file = formData.get("file");
        const fileUrl = formData.get("fileUrl");
        const title = formData.get("title") || "Untitled";
        const type = formData.get("type") || "notes";
        const author = formData.get("author") || "Anonymous";
        const college = formData.get("college") || "Other";
        const subject = formData.get("subject") || "General";
        const description = formData.get("description") || "";
        const date = new Date().toISOString().split("T")[0];

        let storedFileName = fileUrl || "Document.pdf";

        // 1. Upload to ImageKit.io (20 GB Free Storage - No Credit Card Required)
        const ikKey = env.IMAGEKIT_PRIVATE_KEY;
        if (file && typeof file === "object" && file.size > 0 && ikKey && ikKey !== "YOUR_IMAGEKIT_PRIVATE_KEY") {
          const originalName = file.name || "document.pdf";
          const fileExt = originalName.split(".").pop() || "pdf";
          const uniqueName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;

          const ikFormData = new FormData();
          ikFormData.append("file", file);
          ikFormData.append("fileName", uniqueName);
          ikFormData.append("folder", "/campusvault");
          ikFormData.append("useUniqueFileName", "true");

          const ikRes = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
            method: "POST",
            headers: {
              "Authorization": "Basic " + btoa(ikKey.trim() + ":"),
            },
            body: ikFormData,
          });

          if (!ikRes.ok) {
            const errText = await ikRes.text();
            console.error("ImageKit error response:", errText);
            throw new Error(`ImageKit upload failed (${ikRes.status}). Check your IMAGEKIT_PRIVATE_KEY in Cloudflare Worker.`);
          }

          const ikData = await ikRes.json();
          storedFileName = ikData.url;
        }
        // 2. Upload to Cloudflare R2 bucket (if configured)
        else if (file && typeof file === "object" && file.size > 0 && env.BUCKET) {
          const originalName = file.name || "document.pdf";
          const fileExt = originalName.split(".").pop() || "pdf";
          storedFileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;

          await env.BUCKET.put(storedFileName, file.stream(), {
            httpMetadata: {
              contentType: file.type || "application/octet-stream",
              contentDisposition: `inline; filename="${encodeURIComponent(originalName)}"`,
            },
          });
        }

        // Insert metadata into Cloudflare D1
        const insertStmt = env.DB.prepare(`
          INSERT INTO materials (title, type, author, college, subject, description, date, fileName, rating_sum, rating_count)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
        `);

        const result = await insertStmt.bind(
          title,
          type,
          author,
          college,
          subject,
          description,
          date,
          storedFileName
        ).run();

        return jsonResponse({
          success: true,
          id: result.meta?.last_row_id,
          fileName: storedFileName,
          message: "Material published successfully"
        }, 201);
      }

      // Route: POST /api/rate (Atomic rating increment in D1)
      if (request.method === "POST" && pathname === "/api/rate") {
        const body = await request.json();
        const { id, rating } = body;

        if (!id || !rating || rating < 1 || rating > 5) {
          return jsonResponse({ error: "Invalid rating or material id" }, 400);
        }

        const updateStmt = env.DB.prepare(`
          UPDATE materials 
          SET rating_sum = rating_sum + ?, rating_count = rating_count + 1 
          WHERE id = ?
        `);

        await updateStmt.bind(rating, id).run();

        // Fetch updated values
        const updated = await env.DB.prepare(`
          SELECT rating_sum, rating_count FROM materials WHERE id = ?
        `).bind(id).first();

        return jsonResponse({
          success: true,
          rating_sum: updated?.rating_sum || 0,
          rating_count: updated?.rating_count || 0
        });
      }

      // Route: POST /api/migrate (Import all previous Supabase records into Cloudflare D1)
      if (request.method === "POST" && pathname === "/api/migrate") {
        const supabaseUrl = 'https://yrdwwkzgpklykbknhmck.supabase.co/rest/v1/materials?select=*';
        const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlyZHd3a3pncGtseWtia25obWNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzOTgyMjEsImV4cCI6MjA5MDk3NDIyMX0.q-RDB0qmj9iV4mQknkmhighBLr406sdxbQSpn5XX3To';

        const sbRes = await fetch(supabaseUrl, {
          headers: {
            apikey: supabaseKey,
            Authorization: "Bearer " + supabaseKey,
          },
        });

        if (!sbRes.ok) {
          throw new Error("Failed to fetch data from Supabase");
        }

        const items = await sbRes.json();
        let insertedCount = 0;

        const insertStmt = env.DB.prepare(`
          INSERT INTO materials (title, type, author, college, subject, description, date, fileName, rating_sum, rating_count)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const item of items) {
          const fileUrl = 'https://yrdwwkzgpklykbknhmck.supabase.co/storage/v1/object/public/uploads/' + item.fileName;
          await insertStmt.bind(
            item.title || 'Untitled',
            item.type || 'notes',
            item.author || 'Anonymous',
            item.college || 'Other',
            item.subject || 'General',
            item.description || '',
            item.date || new Date().toISOString().split('T')[0],
            fileUrl,
            item.rating_sum || 0,
            item.rating_count || 0
          ).run();
          insertedCount++;
        }

        return jsonResponse({
          success: true,
          message: `Successfully imported ${insertedCount} materials from Supabase to Cloudflare D1!`,
          count: insertedCount,
        });
      }

      // Route: POST /api/migrate-files-to-imagekit (Copy old Supabase PDF files directly to ImageKit)
      if (request.method === "POST" && pathname === "/api/migrate-files-to-imagekit") {
        const ikKey = env.IMAGEKIT_PRIVATE_KEY;
        if (!ikKey) {
          return jsonResponse({ error: "IMAGEKIT_PRIVATE_KEY is not configured in Worker variables" }, 400);
        }

        // Find all records that still point to Supabase storage
        const { results } = await env.DB.prepare(`
          SELECT id, fileName, title FROM materials WHERE fileName LIKE '%supabase.co%'
        `).all();

        if (!results || results.length === 0) {
          return jsonResponse({
            success: true,
            message: "All files have already been migrated to ImageKit! None pointing to Supabase.",
            migratedCount: 0
          });
        }

        const migrated = [];
        const errors = [];
        const updateStmt = env.DB.prepare(`UPDATE materials SET fileName = ? WHERE id = ?`);

        for (const item of results) {
          try {
            const originalFileName = item.fileName.split("/").pop() || "document.pdf";
            const ikFormData = new FormData();
            ikFormData.append("file", item.fileName); // ImageKit downloads the remote Supabase file URL directly!
            ikFormData.append("fileName", originalFileName);
            ikFormData.append("folder", "/campusvault");
            ikFormData.append("useUniqueFileName", "true");

            let ikRes = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
              method: "POST",
              headers: {
                "Authorization": "Basic " + btoa(ikKey.trim() + ":"),
              },
              body: ikFormData,
            });

            // If URL-based upload failed (e.g. file > 25MB limit), fetch as binary blob and re-upload
            if (!ikRes.ok) {
              const fileRes = await fetch(item.fileName);
              if (fileRes.ok) {
                const blob = await fileRes.blob();
                const binaryForm = new FormData();
                binaryForm.append("file", blob, originalFileName);
                binaryForm.append("fileName", originalFileName);
                binaryForm.append("folder", "/campusvault");
                binaryForm.append("useUniqueFileName", "true");

                ikRes = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
                  method: "POST",
                  headers: {
                    "Authorization": "Basic " + btoa(ikKey.trim() + ":"),
                  },
                  body: binaryForm,
                });
              }
            }

            if (ikRes.ok) {
              const ikData = await ikRes.json();
              // Update all rows that used this exact Supabase file URL
              await env.DB.prepare(`UPDATE materials SET fileName = ? WHERE fileName = ?`).bind(ikData.url, item.fileName).run();
              migrated.push({ id: item.id, title: item.title, newUrl: ikData.url });
            } else {
              const err = await ikRes.text();
              console.error(`Failed to migrate ${item.id}:`, err);
              errors.push({ id: item.id, title: item.title, status: ikRes.status, error: err });
            }
          } catch (err) {
            console.error(`Error migrating item ${item.id}:`, err);
            errors.push({ id: item.id, title: item.title, error: err.message });
          }
        }

        return jsonResponse({
          success: true,
          message: `Successfully migrated ${migrated.length} of ${results.length} files from Supabase to ImageKit!`,
          migratedCount: migrated.length,
          total: results.length,
          migrated,
          errors
        });
      }

      // Route: POST /api/clean-duplicates (Remove duplicate entries in D1)
      if (request.method === "POST" && pathname === "/api/clean-duplicates") {
        const result = await env.DB.prepare(`
          DELETE FROM materials 
          WHERE id NOT IN (
            SELECT MIN(id) 
            FROM materials 
            GROUP BY title, college, subject
          )
        `).run();

        return jsonResponse({
          success: true,
          message: "Duplicate rows cleaned up successfully!",
          deletedCount: result.meta?.changes || 0
        });
      }

      // Route: POST /api/fix-large-files (Update 33-34MB files in D1)
      if (request.method === "POST" && pathname === "/api/fix-large-files") {
        await env.DB.prepare(`
          UPDATE materials 
          SET fileName = 'https://files.catbox.moe/46c60b.pdf' 
          WHERE fileName LIKE '%1776082211748_dzedi.pdf%'
        `).run();
        await env.DB.prepare(`
          UPDATE materials 
          SET fileName = 'https://files.catbox.moe/r424ar.pdf' 
          WHERE fileName LIKE '%1776063948903_wqloba.pdf%'
        `).run();

        return jsonResponse({
          success: true,
          message: "All remaining large files successfully linked to permanent storage!"
        });
      }

      // Route: GET /api/files/:filename (Serve file directly from R2)
      if (request.method === "GET" && pathname.startsWith("/api/files/")) {
        const fileName = decodeURIComponent(pathname.replace("/api/files/", ""));
        const object = await env.BUCKET.get(fileName);

        if (!object) {
          return new Response("File Not Found", { status: 404 });
        }

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set("etag", object.httpEtag);
        headers.set("Access-Control-Allow-Origin", "*");
        headers.set("Cache-Control", "public, max-age=31536000, immutable");

        return new Response(object.body, { headers });
      }

      // Root / Health check
      if (pathname === "/" || pathname === "/api") {
        return jsonResponse({
          name: "CampusVault Cloudflare API",
          status: "healthy",
          endpoints: ["/api/materials", "/api/upload", "/api/rate", "/api/files/:filename"]
        });
      }

      return jsonResponse({ error: "Not Found" }, 404);
    } catch (error) {
      console.error("Worker Error:", error);
      return jsonResponse({ error: error.message || "Internal Server Error" }, 500);
    }
  },
};

// Helper: standard JSON response with CORS headers
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

// Helper: handle CORS preflight requests
function handleCors() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}
