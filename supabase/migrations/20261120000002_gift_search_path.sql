-- Advisor fix: pin search_path on the small gift code helpers (no behavior change).
alter function public._gift_alpha() set search_path = '';
alter function public._gift_norm(text) set search_path = '';
alter function public._luhn(text) set search_path = '';
