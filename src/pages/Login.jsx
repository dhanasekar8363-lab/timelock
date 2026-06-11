function Login() {
  return (
    <div
      style={{
        color: "white",
        textAlign: "center",
        paddingTop: "100px"
      }}
    >
      <h1>🔐 Login</h1>

      <input
        type="email"
        placeholder="Email"
      />

      <br /><br />

      <input
        type="password"
        placeholder="Password"
      />
    </div>
  );
}

export default Login;