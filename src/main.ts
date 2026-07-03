import { invoke } from "@tauri-apps/api/core";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `<h1>soundgarden</h1><p id="status">connecting…</p>`;

invoke<string>("ping")
  .then((msg) => {
    document.querySelector("#status")!.textContent = msg;
  })
  .catch((e) => {
    document.querySelector("#status")!.textContent = `bridge error: ${e}`;
  });
