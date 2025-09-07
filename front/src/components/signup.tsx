import { useState } from "react";
import axios from "axios";

function Signup() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function signup() {
    if (!username || !password) {
      setError("Please fill in both fields");
      return;
    }

    axios.post("http://localhost:3000/signup", {
      email: username,
      password: password
    }, {
      headers: { "Content-Type": "application/json" }
    })
    .then(() => {
      window.location.href = "/signin";
    })
    .catch((err) => {
      console.error(err);
      setError(err.response?.data?.message || "Signup failed");
    });
  }

  return (
    <div>
      <h2>Signup</h2>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <input
        placeholder="Enter username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <input
        type="password"
        placeholder="Enter password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button onClick={signup}>Signup</button>
    </div>
  );
}

export default Signup;
