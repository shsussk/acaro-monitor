// assets/js/authGuard.js
import { supabase } from "./supabaseClient.js";

export async function requireAuth() {
  let user;
  try {
    const { data, error } = await supabase.auth.getUser();
    // error aquí es error de red/token, no "no hay sesión"
    if (error) throw error;
    user = data.user;
  } catch (e) {
    // Fallo de red u otro error — no redirigir, dejar que el llamador decida
    console.error("requireAuth: error al verificar sesión", e);
    // Lanzamos para que el módulo muestre su propio mensaje de error
    throw e;
  }

  if (!user) {
    const page = window.location.pathname.split("/").pop() || "index.html";
    const next = encodeURIComponent(page);
    window.location.href = `login.html?next=${next}`;

    // CAMBIO CRÍTICO: devolver una promesa que nunca resuelve.
    // Sin esto, JS continúa ejecutando el código del llamador con user = null
    // antes de que el navegador complete el redirect, causando errores como
    // "Cannot read properties of null (reading 'id')" en admin.js, dashboard.js, etc.
    return new Promise(() => {});
  }

  return user;
}
