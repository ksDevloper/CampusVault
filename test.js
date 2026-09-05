const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yrdwwkzgpklykbknhmck.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlyZHd3a3pncGtseWtia25obWNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzOTgyMjEsImV4cCI6MjA5MDk3NDIyMX0.q-RDB0qmj9iV4mQknkmhighBLr406sdxbQSpn5XX3To';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    const { data, error } = await supabase.from('materials').select('*');
    if (error) {
        console.error("ERROR:", error);
    } else {
        console.log("SUCCESS:", data);
    }
}
test();
