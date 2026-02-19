import { fetchFincas, fetchBloquesByFinca } from "./data.js";

init();

async function init(){
  try{
    const fincas = await fetchFincas();
    renderFincas(fincas);

    const allBloques = [];
    for(const f of fincas){
      const bs = await fetchBloquesByFinca(f.id);
      for(const b of bs) allBloques.push({ finca: f.nombre, ...b });
    }
    renderBloques(allBloques);
    setStatus("");
  } catch(e){
    setStatus(`Error: ${e.message || e}`);
  }
}

function renderFincas(rows){
  const tbody = document.querySelector("#fTbl tbody");
  tbody.innerHTML = "";
  for(const r of rows){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.id}</td><td>${r.nombre}</td>`;
    tbody.appendChild(tr);
  }
}

function renderBloques(rows){
  const tbody = document.querySelector("#bTbl tbody");
  tbody.innerHTML = "";
  for(const r of rows){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.finca}</td>
      <td>${r.nombre}</td>
      <td>${r.plantas_total ?? ""}</td>
      <td>${r.porcentaje ?? ""}</td>
      <td>${r.plantas_muestreo ?? ""}</td>
    `;
    tbody.appendChild(tr);
  }
}

function setStatus(msg){
  document.getElementById("status").textContent = msg || "";
}
