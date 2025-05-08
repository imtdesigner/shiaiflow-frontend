import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vemyttchqkruhnidapmn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlbXl0dGNocWtydWhuaWRhcG1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ4MjAxNzEsImV4cCI6MjA2MDM5NjE3MX0.EQ7NWBGUHt29ncIsiYk0I-vI36RbrPPY4diu34tAvC4'; // your full anon key

export const supabase = createClient(supabaseUrl, supabaseKey);