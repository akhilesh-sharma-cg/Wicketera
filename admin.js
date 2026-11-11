
// ==========================================
// WICKETRA - ADMIN AUTHENTICATION
// ==========================================

const SUPABASE_URL = "https://dpioesaloceszadbzapm.supabase.co";

const SUPABASE_KEY = "sb_publishable_E5lkrWe8IImnVOA9CGbKfA_vZCsOOCD";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

// ==========================================
// ADMIN LOGIN
// ==========================================

const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
const loginButton = document.getElementById("loginButton");

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  loginButton.disabled = true;
  loginButton.textContent = "Signing in...";
  loginMessage.textContent = "";

  try {
    // Step 1: Authenticate user
    const { data, error } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    const user = data.user;

    // Step 2: Check admin role
    const { data: roleData, error: roleError } = await db
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (roleError) throw roleError;

    // Step 3: Allow only administrators
    if (!roleData || roleData.role !== "admin") {
      await db.auth.signOut();
      throw new Error("Access denied. This account is not an administrator.");
    }

    // Step 4: Successful login
    loginMessage.textContent = "Login successful! Opening dashboard...";
    loginMessage.style.color = "#b6ff4a";

    window.location.href = "dashboard.html";

  } catch (error) {
    loginMessage.textContent = error.message || "Login failed. Please try again.";
    loginMessage.style.color = "#ff7777";

    loginButton.disabled = false;
    loginButton.textContent = "Sign In to Dashboard ↗";
  }
});

