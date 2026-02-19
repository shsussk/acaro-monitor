// assets/js/authGuard.js
import { supabase } from "./supabaseClient.js";

// Redirige a login si no hay sesión válida
export async function requireAuth() {
  const { data: { user } } = await supabase.auth.getUser(); // validación real con servidor [web:81]
  if (!user) {
    const next = encodeURIComponent(window.location.pathname.split("/").pop() || "index.html");
    window.location.href = `login.html?next=${next}`;
    return null;
  }
  return user;
}
