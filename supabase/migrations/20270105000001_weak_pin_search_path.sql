-- Security check (Supabase advisor "function_search_path_mutable"): _weak_pin had no fixed search path.
-- It only uses built-in text checks, so an empty path changes nothing in what it returns.
alter function public._weak_pin(text) set search_path = '';
