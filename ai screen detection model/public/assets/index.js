const adminForm = document.getElementById("admin-login-form");
const adminOutput = document.getElementById("admin-login-output");
const candidateForm = document.getElementById("candidate-login-form");
const candidateOutput = document.getElementById("candidate-login-output");

adminForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(adminForm);
  const body = Object.fromEntries(data.entries());

  const response = await fetch("/api/admin-login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = await response.json();
  if (!response.ok) {
    adminOutput.textContent = payload.error || "Unable to log in.";
    return;
  }

  window.location.href = `/admin.html?auth=${encodeURIComponent(payload.accessKey)}`;
});

candidateForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(candidateForm);
  const rawValue = String(data.get("invite") || "").trim();

  if (!rawValue) {
    candidateOutput.textContent = "Paste a valid invite link or token.";
    return;
  }

  let token = rawValue;
  if (rawValue.includes("token=")) {
    try {
      token = new URL(rawValue).searchParams.get("token") || "";
    } catch {
      const match = rawValue.match(/token=([^&]+)/);
      token = match ? match[1] : rawValue;
    }
  }

  if (!token.startsWith("join_")) {
    candidateOutput.textContent = "Token must start with join_.";
    return;
  }

  window.location.href = `/room.html?role=candidate&token=${encodeURIComponent(token)}`;
});
