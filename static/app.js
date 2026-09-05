document.addEventListener('DOMContentLoaded', () => {
    try {
        // Initialize Lucide Icons
        if (window.lucide) lucide.createIcons();

        // Elements
        const themeBtn = document.getElementById('theme-toggle');
        const body = document.body;
        const addBtn = document.getElementById('add-btn');
        const addModal = document.getElementById('add-modal');
        const closeModalBtn = document.getElementById('close-modal');
        const addForm = document.getElementById('add-form');

        const suggestBtn = document.getElementById('suggest-btn');
        const suggestModal = document.getElementById('suggest-modal');
        const closeSuggestBtn = document.getElementById('close-suggest-modal');

        const reportModal = document.getElementById('report-modal');
        const closeReportBtn = document.getElementById('close-report-modal');
        const reportForm = document.getElementById('report-form');
        const reportHiddenTitle = document.getElementById('report-hidden-title');
        const reportTitleSpan = document.getElementById('report-material-title');

        let toastTimeout;
        function showToast(message, type = 'success') {
            const toast = document.getElementById('toast');
            const icon = document.getElementById('toast-icon');
            const msg = document.getElementById('toast-message');

            toast.className = 'toast';
            if (type === 'error') {
                toast.classList.add('error');
                icon.setAttribute('data-lucide', 'alert-triangle');
            } else {
                icon.setAttribute('data-lucide', 'check-circle');
            }

            msg.textContent = message;
            if (window.lucide) lucide.createIcons();

            toast.classList.add('show');
            clearTimeout(toastTimeout);
            toastTimeout = setTimeout(() => toast.classList.remove('show'), 4000);
        }

        const materialsGrid = document.getElementById('materials-grid');
        const noResults = document.getElementById('no-results');

        // Filters
        const navLinks = document.querySelectorAll('.nav-links a');
        const collegeSelect = document.getElementById('college-select');
        const subjectSelect = document.getElementById('subject-select');
        const searchInput = document.getElementById('search-input');

        // Cloudflare Worker API Configuration (D1 Database + ImageKit 20 GB Storage)
        // Set this to your deployed Cloudflare Worker URL, e.g. 'https://campusvault-api.<your-subdomain>.workers.dev'
        const API_BASE_URL = 'https://campusvault-api.ks8375050.workers.dev/';

        // State
        let currentFilter = 'all'; // all, notes, assignments, papers
        let materials = [];

        // Maps for display names
        const typeLabel = {
            notes: "Notes",
            assignments: "Assignment",
            papers: "Past Paper"
        };

        const typeIcons = {
            notes: "book",
            assignments: "file-text",
            papers: "scroll"
        };

        // Theme Toggle
        themeBtn.addEventListener('click', () => {
            body.classList.toggle('dark-theme');
            const isDark = body.classList.contains('dark-theme');
            themeBtn.innerHTML = isDark ? '<i data-lucide="sun"></i>' : '<i data-lucide="moon"></i>';
            lucide.createIcons();
        });

        // Modal Logic
        addBtn.addEventListener('click', () => {
            addModal.classList.add('active');
        });

        closeModalBtn.addEventListener('click', () => {
            addModal.classList.remove('active');
        });

        addModal.addEventListener('click', (e) => {
            if (e.target === addModal) {
                addModal.classList.remove('active');
            }
        });

        if (suggestBtn) {
            suggestBtn.addEventListener('click', () => {
                suggestModal.classList.add('active');
            });
        }

        if (closeSuggestBtn) {
            closeSuggestBtn.addEventListener('click', () => {
                suggestModal.classList.remove('active');
            });
        }

        if (suggestModal) {
            suggestModal.addEventListener('click', (e) => {
                if (e.target === suggestModal) {
                    suggestModal.classList.remove('active');
                }
            });
        }

        if (closeReportBtn) {
            closeReportBtn.addEventListener('click', () => {
                reportModal.classList.remove('active');
            });
        }

        if (reportModal) {
            reportModal.addEventListener('click', (e) => {
                if (e.target === reportModal) {
                    reportModal.classList.remove('active');
                }
            });
        }

        if (reportForm) {
            reportForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = reportForm.querySelector('button[type="submit"]');
                const originalBtn = btn.innerHTML;

                btn.classList.add('loading');
                btn.innerHTML = '<i data-lucide="loader" class="spinner"></i> <span>Submitting...</span>';
                if (window.lucide) lucide.createIcons();

                try {
                    const suggestFormAction = document.querySelector('#suggest-modal form').action;
                    const reason = document.getElementById('report-reason').value;
                    const details = document.getElementById('report-details').value;
                    const title = document.getElementById('report-hidden-title').value;

                    const formData = new FormData();
                    formData.append('name', 'Automated Content Report');
                    formData.append('email', 'automated-report@campusvault.com');
                    formData.append('_subject', '🚩 Action Required: Material Reported');
                    formData.append('_captcha', 'false'); // Bypasses the silent verification block allowing instant fetch
                    formData.append('message', `ACTION REQUIRED:\n\nA user has reported material for inappropriate content.\n\nMaterial Title: ${title}\nReason: ${reason}\nDetails: ${details}\n\nPlease check your Supabase dashboard to moderate this file.`);

                    const res = await fetch(suggestFormAction, {
                        method: 'POST',
                        body: formData,
                        headers: { 'Accept': 'application/json' }
                    });

                    if (res.ok) {
                        showToast("Thank you. The administrator has been notified.", "success");
                        reportForm.reset();
                        reportModal.classList.remove('active');
                    } else {
                        showToast("Failed to send report. Please try again.", "error");
                    }
                } catch (err) {
                    console.error(err);
                    showToast("Network error. Please make sure you are connected.", "error");
                } finally {
                    btn.classList.remove('loading');
                    btn.innerHTML = originalBtn;
                    if (window.lucide) lucide.createIcons();
                }
            });
        }

        // Handle Form Submit
        addForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!API_BASE_URL || API_BASE_URL.includes('YOUR_SUBDOMAIN')) {
                alert("Please configure your Cloudflare Worker URL in static/app.js first!");
                return;
            }

            const fileInput = document.getElementById('material-file');
            const submitBtn = document.querySelector('#add-form button[type="submit"]');
            const originalBtnHtml = submitBtn.innerHTML;

            try {
                // Loading Animation
                submitBtn.classList.add('loading');
                submitBtn.innerHTML = '<i data-lucide="loader" class="spinner"></i> Publishing...';
                const formData = new FormData();
                formData.append('title', document.getElementById('title').value);
                formData.append('type', document.getElementById('type').value);
                formData.append('author', document.getElementById('author').value);
                formData.append('college', document.getElementById('college').value);
                formData.append('subject', document.getElementById('subject').value);
                formData.append('description', document.getElementById('description').value);

                // Attach file if selected
                if (fileInput.files.length > 0) {
                    formData.append('file', fileInput.files[0]);
                }

                submitBtn.innerHTML = '<i data-lucide="loader" class="spinner"></i> Publishing to Vault...';
                if (window.lucide) lucide.createIcons();

                const response = await fetch(`${API_BASE_URL}/api/upload`, {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error || `Upload failed with status ${response.status}`);
                }

                showToast("Material published successfully!", "success");
                addForm.reset();
                addModal.classList.remove('active');

                // Refresh materials list
                await fetchMaterials();

            } catch (err) {
                console.error("Submission failed", err);
                showToast(err.message || "Submission failed. Please check console.", "error");
            } finally {
                // Reset Loading Animation
                submitBtn.classList.remove('loading');
                submitBtn.innerHTML = originalBtnHtml;
                if (window.lucide) lucide.createIcons();
            }
        });

        // Handle Suggestion Form Submit via AJAX
        const suggestForm = document.querySelector('#suggest-modal form');
        if (suggestForm) {
            suggestForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = suggestForm.querySelector('button[type="submit"]');
                const originalBtn = btn.innerHTML;

                btn.classList.add('loading');
                btn.innerHTML = '<i data-lucide="loader" class="spinner"></i> <span>Sending...</span>';
                if (window.lucide) lucide.createIcons();

                try {
                    const formData = new FormData(suggestForm);
                    const res = await fetch(suggestForm.action, {
                        method: 'POST',
                        body: formData,
                        headers: {
                            'Accept': 'application/json'
                        }
                    });

                    if (res.ok) {
                        showToast("Thank you! Your suggestion has been successfully sent.", "success");
                        suggestForm.reset();
                        suggestModal.classList.remove('active');
                    } else {
                        showToast("Failed to send suggestion. Please try again.", "error");
                    }
                } catch (err) {
                    console.error(err);
                    showToast("Network error. Please make sure you are connected to the internet.", "error");
                } finally {
                    btn.classList.remove('loading');
                    btn.innerHTML = originalBtn;
                    if (window.lucide) lucide.createIcons();
                }
            });
        }

        // Filters Logic
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                navLinks.forEach(l => l.classList.remove('active'));
                e.target.classList.add('active');

                currentFilter = e.target.getAttribute('data-filter');
                renderMaterials();
            });
        });

        collegeSelect.addEventListener('change', renderMaterials);
        subjectSelect.addEventListener('change', renderMaterials);
        searchInput.addEventListener('input', renderMaterials);

        // Fetch Materials From Cloudflare (D1 Database)
        async function fetchMaterials() {
            if (!API_BASE_URL || API_BASE_URL.includes('YOUR_SUBDOMAIN')) {
                materialsGrid.innerHTML = `
                <div style="grid-column: 1 / -1; background:rgba(255,165,0,0.1); border: 1px solid rgba(255,165,0,0.3); padding:2rem; border-radius:12px; text-align:center;">
                    <p style="margin-bottom:0.5rem; font-size:1.1rem; font-weight:600; color:#f59e0b;">Cloudflare Setup Required</p>
                    <p style="color:var(--text-secondary); font-size:0.9rem;">
                        Deploy your Cloudflare Worker and update <code>API_BASE_URL</code> in <code>static/app.js</code> with your worker URL (e.g. <code>https://campusvault-api.&lt;subdomain&gt;.workers.dev</code>).
                    </p>
                </div>`;
                return;
            }

            try {
                const res = await fetch(`${API_BASE_URL}/api/materials`);
                if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

                const data = await res.json();

                materials = (data || []).map(r => ({
                    id: r.id,
                    title: r.title,
                    type: r.type,
                    author: r.author,
                    college: r.college,
                    subject: r.subject,
                    description: r.description,
                    date: r.date,
                    fileName: r.fileName,
                    rating: {
                        sum: r.rating_sum || 0,
                        count: r.rating_count || 0
                    }
                }));

                updateDynamicLists();
                renderMaterials();
            } catch (err) {
                console.error("Failed to fetch materials", err);
                materialsGrid.innerHTML = `<p style="text-align:center;width:100%;color:#ef4444;">Error loading items from Cloudflare: ${err.message || err.toString()}</p>`;
            }
        }

        // Render Grid
        function renderMaterials() {
            try {
                const collegeFilter = collegeSelect.value;
                const subjectFilter = subjectSelect.value;
                const searchQuery = searchInput.value.toLowerCase();

                // Apply filters
                const filtered = materials.filter(m => {
                    const matchesType = currentFilter === 'all' || m.type === currentFilter;
                    const matchesCollege = collegeFilter === 'all' || m.college === collegeFilter;
                    const matchesSubject = subjectFilter === 'all' || m.subject === subjectFilter;

                    const title = String(m.title || '');
                    const author = String(m.author || '');
                    const description = String(m.description || '');

                    const matchesSearch = title.toLowerCase().includes(searchQuery) ||
                        author.toLowerCase().includes(searchQuery) ||
                        description.toLowerCase().includes(searchQuery);

                    return matchesType && matchesCollege && matchesSubject && matchesSearch;
                });

                materialsGrid.innerHTML = '';

                if (filtered.length === 0) {
                    noResults.classList.remove('hidden');
                } else {
                    noResults.classList.add('hidden');

                    filtered.forEach((m, index) => {
                        const card = document.createElement('div');
                        card.className = 'card glass-panel';
                        card.style.animationDelay = `${(index % 10) * 0.1}s`;

                        let average = m.rating && m.rating.count > 0 ? (m.rating.sum / m.rating.count).toFixed(1) : 0;

                        let starsHtml = '';
                        for (let i = 1; i <= 5; i++) {
                            let isFilled = Math.round(average) >= i;
                            let starClass = isFilled ? 'star filled' : 'star';
                            starsHtml += `<span class="${starClass}" data-value="${i}"><i data-lucide="star"></i></span>`;
                        }

                        // Generate file URL for download (Firebase Storage direct URL or Worker file route)
                        let downloadUrl = "#";
                        if (m.fileName) {
                            if (m.fileName.startsWith('http://') || m.fileName.startsWith('https://')) {
                                downloadUrl = m.fileName;
                            } else if (API_BASE_URL && !API_BASE_URL.includes('YOUR_SUBDOMAIN')) {
                                downloadUrl = `${API_BASE_URL}/api/files/${encodeURIComponent(m.fileName)}`;
                            }
                        }

                        card.innerHTML = `
                    <div class="card-header">
                        <div class="card-icon">
                            <i data-lucide="${typeIcons[m.type]}"></i>
                        </div>
                        <div style="display:flex; align-items:center; gap:0.5rem;">
                            <span class="badge type-${m.type}">${typeLabel[m.type]}</span>
                            <button class="icon-btn report-btn" data-title="${String(m.title || 'Untitled').replace(/"/g, '&quot;')}" title="Report Inappropriate Content" style="width:28px; height:28px; color: #ef4444; border: 1px solid var(--glass-border); border-radius: 6px;">
                                <i data-lucide="flag" style="width: 14px; height: 14px;"></i>
                            </button>
                        </div>
                    </div>
                    <div style="flex-grow: 1; display:flex; flex-direction:column; gap:0.5rem; margin-top:0.5rem;">
                        <h3 class="card-title">${m.title}</h3>
                        <p class="card-desc">${m.description || 'No description provided.'}</p>
                    </div>
                    <div class="card-meta">
                        <div class="meta-item">
                            <i data-lucide="building"></i>
                            <span>${m.college}</span>
                        </div>
                        <div class="meta-item">
                            <i data-lucide="book-open"></i>
                            <span>${m.subject}</span>
                        </div>
                        <div class="meta-item" style="margin-left: auto;">
                            <i data-lucide="user"></i>
                            <span>${m.author}</span>
                        </div>
                    </div>
                    <div class="card-rating">
                        <a href="${downloadUrl}" target="_blank" class="primary-btn" style="padding: 0.4rem 0.8rem; font-size: 0.875rem; gap: 0.25rem; text-decoration:none; color:white;">
                            <i data-lucide="download" style="width: 14px; height: 14px;"></i> Download
                        </a>
                        <div class="stars-container">
                            <div class="stars" data-id="${m.id}">
                                ${starsHtml}
                            </div>
                            <span class="rating-text">${average > 0 ? average : 'No ratings'} (${m.rating ? m.rating.count : 0})</span>
                        </div>
                    </div>
                `;
                        materialsGrid.appendChild(card);
                    });

                    // Re-initialize icons
                    lucide.createIcons();
                }
            } catch (err) { alert("RENDER ERROR: " + err.message + " --- " + err.stack); }
        } // Dynamic Lists Generator
        function updateDynamicLists() {
            // Collect unique values
            const colleges = [...new Set(materials.map(m => m.college))].sort();
            const subjects = [...new Set(materials.map(m => m.subject))].sort();

            // Update Filters Dropdowns
            const currentCollege = collegeSelect.value;
            const currentSubject = subjectSelect.value;

            collegeSelect.innerHTML = '<option value="all">All Colleges</option>';
            colleges.forEach(c => collegeSelect.innerHTML += `<option value="${c}">${c}</option>`);

            subjectSelect.innerHTML = '<option value="all">All Subjects</option>';
            subjects.forEach(s => subjectSelect.innerHTML += `<option value="${s}">${s}</option>`);

            if (colleges.includes(currentCollege)) collegeSelect.value = currentCollege;
            if (subjects.includes(currentSubject)) subjectSelect.value = currentSubject;

            // Update Input Datalists for Modal
            const collegeList = document.getElementById('college-list');
            const subjectList = document.getElementById('subject-list');

            if (collegeList) {
                collegeList.innerHTML = '';
                colleges.forEach(c => collegeList.innerHTML += `<option value="${c}">`);
            }
            if (subjectList) {
                subjectList.innerHTML = '';
                subjects.forEach(s => subjectList.innerHTML += `<option value="${s}">`);
            }
        }

        // Initial load
        fetchMaterials();

        if (!body.classList.contains('dark-theme')) {
            themeBtn.innerHTML = '<i data-lucide="moon"></i>';
            lucide.createIcons();
        }

        // Report & Rating Event Delegation
        materialsGrid.addEventListener('click', async (e) => {
            const reportBtn = e.target.closest('.report-btn');
            if (reportBtn && reportModal) {
                const materialTitle = reportBtn.getAttribute('data-title');

                document.getElementById('report-material-title').textContent = materialTitle;
                document.getElementById('report-hidden-title').value = materialTitle;

                reportModal.classList.add('active');
                return;
            }

            const starBtn = e.target.closest('.star');
            if (starBtn && API_BASE_URL && !API_BASE_URL.includes('YOUR_SUBDOMAIN')) {
                const rating = parseInt(starBtn.getAttribute('data-value'));
                const container = starBtn.closest('.stars');
                const id = parseInt(container.getAttribute('data-id'));

                const material = materials.find(m => m.id === id);
                if (material) {
                    let userRatings = JSON.parse(localStorage.getItem('campusVaultUserRatings')) || {};

                    if (userRatings[id]) {
                        showToast("You have already rated this material.", "error");
                        return;
                    }

                    try {
                        const res = await fetch(`${API_BASE_URL}/api/rate`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id, rating })
                        });

                        if (!res.ok) {
                            const errorData = await res.json().catch(() => ({}));
                            throw new Error(errorData.error || "Failed to submit rating");
                        }

                        userRatings[id] = rating;
                        localStorage.setItem('campusVaultUserRatings', JSON.stringify(userRatings));
                        showToast("Thank you for your rating!", "success");

                        // Refresh materials to show new rating average
                        await fetchMaterials();

                    } catch (err) {
                        console.error("Failed to submit rating", err);
                        showToast("Failed to submit rating: " + err.message, "error");
                    }
                }
            }
        });

        materialsGrid.addEventListener('mouseover', (e) => {
            const starBtn = e.target.closest('.star');
            if (starBtn) {
                const value = parseInt(starBtn.getAttribute('data-value'));
                const container = starBtn.closest('.stars');
                const stars = container.querySelectorAll('.star');
                stars.forEach(s => {
                    if (parseInt(s.getAttribute('data-value')) <= value) {
                        s.classList.add('hover-active');
                    } else {
                        s.classList.remove('hover-active');
                    }
                });
            }
        });

        materialsGrid.addEventListener('mouseout', (e) => {
            const container = e.target.closest('.stars');
            if (container) {
                const stars = container.querySelectorAll('.star');
                stars.forEach(s => s.classList.remove('hover-active'));
            }
        });
    } catch (err) {
        alert("CRITICAL STARTUP ERROR: " + err.message + "\n\n" + err.stack);
    }
});

