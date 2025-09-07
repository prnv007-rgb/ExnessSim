import { useState } from "react";
import axios from "axios";

function Signin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function signin() {
    axios.post("http://localhost:3000/signin", {
      email,
      password
    }).then((res) => {
      localStorage.setItem("token", res.data.token); 
      console.log(res.data.token);
      window.location.href = "/dashboard";
    }).catch(err => {
      console.error(err.response?.data || err.message);
      alert(err.response?.data?.message || "Signin failed");
    });
  }

  return (
    <div>
      <input
        placeholder="Enter email"
        value={email}
        onChange={e => setEmail(e.target.value)}
      />
      <input
        type="password"
        placeholder="Enter password"
        value={password}
        onChange={e => setPassword(e.target.value)}
      />
      <button onClick={signin}>Signin</button>
    </div>
  );
}

export default Signin;
