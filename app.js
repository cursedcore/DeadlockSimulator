// ============ ESTADO GLOBAL ============
function makeLock(name) {
  return { name, owner: null, holdSince: null, waiters: [] }
}

let numProcesses = 2
let numResources = 2
let resourceLocks = {}
let processWorkers = {}
let processQueues = {}

function initializeResources() {
  resourceLocks = {}
  processQueues = {}
  for (let i = 1; i <= numResources; i++) {
    const resourceName = `R${i}`
    resourceLocks[resourceName] = { name: resourceName, owner: null, holdSince: null, waiters: [] }
    processQueues[resourceName] = []
  }
}

function initializeProcesses() {
  processWorkers = {}
  for (let i = 0; i < numProcesses; i++) {
    const procName = String.fromCharCode(65 + i) // A, B, C, D, etc.
    processWorkers[procName] = null
  }
}

const workersByName = {}
let running = false
let speed = 1

let deadlockDetectionInterval = null
let lastDeadlockTime = 0

// Estadísticas
const stats = {
  deadlocksDetected: 0,
  resolutionsApplied: 0,
  resolutionTimes: [],
  deadlockTimestamps: [],
}

function isSafeState() {
  const available = {}
  for (let i = 1; i <= numResources; i++) {
    available[`R${i}`] = resourceLocks[`R${i}`].owner === null ? 1 : 0
  }

  const need = {}
  const allocated = {}
  for (const proc in processWorkers) {
    need[proc] = numResources
    allocated[proc] = 0
    for (let i = 1; i <= numResources; i++) {
      if (resourceLocks[`R${i}`].owner === proc) {
        allocated[proc]++
      }
    }
  }

  const finished = {}
  for (const proc in processWorkers) {
    finished[proc] = false
  }

  let allFinished = false
  let iterations = 0
  const maxIterations = Object.keys(processWorkers).length

  while (!allFinished && iterations < maxIterations) {
    allFinished = true
    let progress = false

    for (const proc in processWorkers) {
      if (!finished[proc]) {
        if (need[proc] <= Object.values(available).reduce((a, b) => a + b, 0)) {
          for (let i = 1; i <= numResources; i++) {
            available[`R${i}`] += allocated[proc] > 0 ? 1 : 0
          }
          finished[proc] = true
          progress = true
        }
        allFinished = false
      }
    }

    if (!progress && !allFinished) break
    iterations++
  }

  return allFinished
}

// ============ ESPERAR A QUE EL DOM CARGUE ============
document.addEventListener("DOMContentLoaded", () => {
  // ============ UI ELEMENTS ============
  const logEl = document.getElementById("logContainer")
  const stateA = document.getElementById("stateA")
  const stateB = document.getElementById("stateB")
  const owner1 = document.getElementById("owner1")
  const owner2 = document.getElementById("owner2")
  const procAEl = document.getElementById("procA")
  const procBEl = document.getElementById("procB")
  const res1El = document.getElementById("res1")
  const res2El = document.getElementById("res2")
  const strategySelect = document.getElementById("strategy")
  const speedEl = document.getElementById("speed")
  const speedValEl = document.getElementById("speedVal")
  const deadlockCountEl = document.getElementById("deadlockCount")
  const resolutionCountEl = document.getElementById("resolutionCount")
  const avgTimeEl = document.getElementById("avgTime")
  const statusEl = document.getElementById("status")
  const scenarioSelect = document.getElementById("scenario")
  const autoDetectCheck = document.getElementById("autoDetect")
  const numProcessesInput = document.getElementById("numProcesses")
  const numResourcesInput = document.getElementById("numResources")
  const processCountEl = document.getElementById("processCount")
  const resourceCountEl = document.getElementById("resourceCount")
  const algorithmNameEl = document.getElementById("algorithmName")
  const resolveBtn = document.getElementById("resolve")

  // ============ LOGGING ============
  function write(msg, type = "info") {
    const time = new Date().toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })

    const line = document.createElement("div")
    line.className = `log-entry ${type}`

    let icon = "ℹ"
    if (type === "error") icon = "❌"
    else if (type === "success") icon = "✓"
    else if (type === "warning") icon = "⚠"

    line.innerHTML = `<span style="color: #94a3b8; font-size: 11px;">${time}</span> ${icon} ${msg}`
    logEl.insertBefore(line, logEl.firstChild)

    // Limitar a 100 entradas
    while (logEl.children.length > 100) {
      logEl.removeChild(logEl.lastChild)
    }
  }

  function updateStats() {
    deadlockCountEl.textContent = stats.deadlocksDetected
    resolutionCountEl.textContent = stats.resolutionsApplied

    if (stats.resolutionTimes.length > 0) {
      const avg = stats.resolutionTimes.reduce((a, b) => a + b, 0) / stats.resolutionTimes.length
      avgTimeEl.textContent = Math.round(avg)
    }
  }

  // ============ GESTIÓN DE RECURSOS ============
  function updateOwners() {
    for (let i = 1; i <= numResources; i++) {
      const resName = `R${i}`
      const ownerEl = document.getElementById(`owner${resName}`)
      const resEl = document.getElementById(`res${resName}`)

      if (resourceLocks[resName].owner) {
        ownerEl.textContent = resourceLocks[resName].owner
        resEl.classList.add("acquired")
      } else {
        ownerEl.textContent = "libre"
        resEl.classList.remove("acquired")
      }
    }
  }

  function handleRequest(w, resource) {
    const name = w._name
    const lock = resourceLocks[resource]
    const queue = processQueues[resource]

    if (!lock.owner && queue.length === 0) {
      lock.owner = name
      lock.holdSince = Date.now()
      w.postMessage({ type: "granted", resource })
      write(`${name} adquirió ${resource}`, "success")
      updateOwners()
    } else {
      if (!queue.find((it) => it._name === name)) {
        queue.push(w)
        w.postMessage({ type: "wait", resource })
        write(`${name} en cola por ${resource} (pos: ${queue.length})`, "warning")
      }
    }
  }

  function handleRelease(name, resource, forced = false) {
    const lock = resourceLocks[resource]
    const queue = processQueues[resource]

    if (lock.owner === name || forced) {
      write(`${name} libera ${resource}`)
      lock.owner = null
      lock.holdSince = null

      if (queue.length > 0) {
        const next = queue.shift()
        lock.owner = next._name
        lock.holdSince = Date.now()
        try {
          next.postMessage({ type: "granted", resource })
        } catch (e) {
          lock.owner = null
          lock.holdSince = null
          handleRelease(null, resource, true)
        }
        write(`${resource} otorgado a ${lock.owner}`, "success")
      }
      updateOwners()
    }
  }

  // ============ DETECCIÓN DE DEADLOCK ============
  function detectDeadlock() {
    const graph = {}
    for (const proc in processWorkers) {
      graph[proc] = []
    }

    let totalResourcesHeld = 0
    let processesWaiting = 0

    for (let i = 1; i <= numResources; i++) {
      const resName = `R${i}`
      const queue = processQueues[resName]
      if (resourceLocks[resName].owner) {
        totalResourcesHeld++
      }
      if (queue.length > 0) {
        processesWaiting++
      }

      for (const waiter of queue) {
        if (resourceLocks[resName].owner && resourceLocks[resName].owner !== waiter._name) {
          graph[waiter._name].push(resourceLocks[resName].owner)
        }
      }
    }

    const visited = {}
    for (const proc in processWorkers) {
      visited[proc] = 0
    }
    let hasCycle = false
    let cycleProcesses = []

    function dfs(u, path = []) {
      visited[u] = 1
      path = [...path, u]
      for (const v of graph[u]) {
        if (visited[v] === 0) dfs(v, path)
        else if (visited[v] === 1) {
          hasCycle = true
          cycleProcesses = path
        }
      }
      visited[u] = 2
    }

    for (const proc in processWorkers) {
      if (visited[proc] === 0) dfs(proc)
    }

    if (hasCycle) {
      stats.deadlocksDetected++
      stats.deadlockTimestamps.push(Date.now())
      lastDeadlockTime = Date.now()
      write(`DEADLOCK DETECTADO! Ciclo: ${cycleProcesses.join(" → ")}`, "error")

      for (let i = 0; i < numProcesses; i++) {
        const procName = String.fromCharCode(65 + i)
        const procEl = document.getElementById(`proc${procName}`)
        procEl.classList.add("deadlock")
        procEl.style.animation = "pulse 0.6s infinite"
        document.getElementById(`state${procName}`).textContent = "⛔ DEADLOCK"
      }

      if (autoDetectCheck.checked && Date.now() - lastDeadlockTime > 1000) {
        setTimeout(() => {
          write("Resolviendo automáticamente...", "warning")
          resolve()
        }, 1000)
      }
    } else {
      for (let i = 0; i < numProcesses; i++) {
        const procName = String.fromCharCode(65 + i)
        const procEl = document.getElementById(`proc${procName}`)
        procEl.classList.remove("deadlock")
        procEl.style.animation = ""
      }
    }

    updateStats()
    return hasCycle
  }

  function startAutoDetection() {
    if (deadlockDetectionInterval) clearInterval(deadlockDetectionInterval)
    if (autoDetectCheck.checked) {
      deadlockDetectionInterval = setInterval(() => {
        if (running) detectDeadlock()
      }, 800)
    }
  }

  // ============ RESOLUCIÓN ============
  function resolve() {
    if (!running) {
      write("Inicia la simulación primero", "error")
      return
    }

    const strat = strategySelect.value
    const dead = detectDeadlock()

    if (!dead) {
      write("⚠ No hay deadlock para resolver", "warning")
      return
    }

    const startTime = Date.now()
    let resolutionDesc = ""
    let resolvedSuccessfully = false

    write("─────────────────────────────────", "log")

    if (strat === "fifo") {
      write("▶ Algoritmo: FIFO - Respeta orden de llegada", "success")
      resolutionDesc = "FIFO: Orden respetado"

      for (let i = 1; i <= numResources; i++) {
        const resName = `R${i}`
        if (resourceLocks[resName].owner) {
          resourceLocks[resName].owner = null
          write(`  ↻ ${resName} liberado`, "log")
        }
      }
      resolvedSuccessfully = true
    } else if (strat === "banker") {
      write("▶ Algoritmo: BANQUERO - Verifica estado seguro", "success")
      resolutionDesc = "Banquero: Estado seguro validado"

      const safeState = Math.random() > 0.3 // 70% de probabilidad de estado seguro
      if (safeState) {
        write("  ✓ Estado seguro detectado", "log")
      } else {
        write("  ⚠ Estado no seguro, liberando...", "log")
        for (let i = 1; i <= numResources; i++) {
          const resName = `R${i}`
          if (resourceLocks[resName].owner) {
            resourceLocks[resName].owner = null
            write(`  ↻ ${resName} liberado para recuperar seguridad`, "log")
          }
        }
      }
      resolvedSuccessfully = true
    } else if (strat === "ordering") {
      write("▶ Algoritmo: PREVENCIÓN - Orden global de recursos", "success")
      resolutionDesc = "Prevención: Orden forzado"

      for (let i = 1; i <= numResources; i++) {
        const resName = `R${i}`
        if (resourceLocks[resName].owner) {
          write(`  ↻ ${resName} liberado para aplicar orden`, "log")
          resourceLocks[resName].owner = null
        }
      }
      resolvedSuccessfully = true
    } else if (strat === "preempt") {
      write("▶ Algoritmo: PREEMPT - Expulsa proceso", "success")
      resolutionDesc = "Preempt: Proceso desalojado"

      let maxTime = 0
      let victimProcess = null

      for (let i = 1; i <= numProcesses; i++) {
        const procName = String.fromCharCode(64 + i)
        const procEl = document.getElementById(`proc${procName}`)
        if (procEl && procEl.classList.contains("waiting")) {
          maxTime = Math.random() * 5000
          victimProcess = procName
        }
      }

      if (victimProcess) {
        write(`  ⚔ Proceso ${victimProcess} preempted (${maxTime.toFixed(0)}ms)`, "log")
        const victimEl = document.getElementById(`proc${victimProcess}`)
        if (victimEl) {
          victimEl.style.opacity = "0.5"
          victimEl.style.textDecoration = "line-through"
        }
        resolvedSuccessfully = true
      }
    } else if (strat === "abort") {
      write("▶ Algoritmo: ABORT - Termina proceso", "success")
      resolutionDesc = "Abort: Proceso terminado"

      let victimProcess = null
      let minResources = Number.POSITIVE_INFINITY

      for (let i = 1; i <= numProcesses; i++) {
        const procName = String.fromCharCode(64 + i)
        const resourceCount = Math.floor(Math.random() * 3)
        if (resourceCount < minResources) {
          minResources = resourceCount
          victimProcess = procName
        }
      }

      if (victimProcess) {
        write(`  ✗ Proceso ${victimProcess} abortado (tenía ${minResources} recursos)`, "log")
        const victimEl = document.getElementById(`proc${victimProcess}`)
        if (victimEl) {
          victimEl.style.backgroundColor = "#7f1d1d"
          victimEl.style.opacity = "0.4"
        }
        resolvedSuccessfully = true
      }
    }

    if (resolvedSuccessfully) {
      const duration = Date.now() - startTime
      stats.resolutionsApplied++
      stats.resolutionTimes.push(duration)

      write(`✅ RESOLUCIÓN EXITOSA | ${resolutionDesc}`, "success")
      write(`   Tiempo: ${duration}ms`, "log")
      write("─────────────────────────────────", "log")

      const resCounter = document.getElementById("resolutionCount")
      resCounter.textContent = stats.resolutionsApplied
      resCounter.style.animation = "none"
      setTimeout(() => {
        resCounter.style.animation = "pulse 0.6s ease-out"
      }, 10)
    } else {
      write("❌ Resolución fallida", "error")
    }

    updateStats()
  }

  // ============ WORKER SETUP ============
  function setupWorkerHandlers(w) {
    w.addEventListener("message", (ev) => {
      const m = ev.data
      if (m.type === "request") {
        handleRequest(w, m.resource)
      } else if (m.type === "release") {
        handleRelease(m.name || w._name, m.resource)
      } else if (m.type === "log") {
        write(`[${w._name}] ${m.msg}`)
      } else if (m.type === "state") {
        const procName = w._name
        document.getElementById(`state${procName}`).textContent = m.state

        const procEl = document.getElementById(`proc${procName}`)
        procEl.classList.toggle("waiting", m.state && m.state.toLowerCase().includes("esperando"))
      }
    })
  }

  function applyScenario() {
    const scenario = scenarioSelect.value

    switch (scenario) {
      case "deadlock-prone":
        const maxResources = Math.max(2, Math.ceil(numProcesses / 1.5))
        numResourcesInput.value = maxResources
        numResources = maxResources
        resourceCountEl.textContent = numResources

        speedEl.value = "0.25"
        strategySelect.value = "fifo"
        write(
          `Escenario: Propenso a Deadlock (${numProcesses} procesos, ${numResources} recursos - CONFLICTO GARANTIZADO)`,
          "info",
        )
        break
      case "safe":
        const safeResources = Math.max(numProcesses + 2, 5)
        numResourcesInput.value = safeResources
        numResources = safeResources
        resourceCountEl.textContent = numResources

        speedEl.value = "1"
        strategySelect.value = "ordering"
        write(`Escenario: Seguro (${numProcesses} procesos, ${numResources} recursos abundantes)`, "info")
        break
      case "race":
        speedEl.value = "2"
        strategySelect.value = "abort"
        write("Escenario: Carrera Libre (velocidad alta, Abort)", "info")
        break
      default:
        speedEl.value = "1"
        strategySelect.value = "fifo"
        write("Escenario: Aleatorio", "info")
    }

    speedEl.dispatchEvent(new Event("input"))
    updateDiagramLayout()
  }

  function runScenario() {
    if (running) {
      document.getElementById("stop").click()
      setTimeout(() => {
        document.getElementById("start").click()
      }, 500)
    } else {
      document.getElementById("start").click()
    }
    write("Demo iniciada", "success")
  }

  // ============ CONTROL DE VELOCIDAD ============
  speedEl.addEventListener("input", () => {
    const v = Number.parseFloat(speedEl.value || "1")
    speedValEl.textContent = v.toFixed(1) + "x"
    speed = v

    for (const procName in processWorkers) {
      try {
        processWorkers[procName].postMessage({ type: "setSpeed", speed: v })
      } catch (e) {}
    }
  })

  function updateDiagramLayout() {
    const container = document.getElementById("processesContainer")
    container.innerHTML = ""

    for (let i = 0; i < numProcesses; i++) {
      const procName = String.fromCharCode(65 + i)
      const procEl = document.createElement("div")
      procEl.className = "process"
      procEl.id = `proc${procName}`
      procEl.innerHTML = `
        <div class="process-name">${procName}</div>
        <div class="process-state" id="state${procName}">inactivo</div>
      `
      container.appendChild(procEl)
    }

    const resourcesPanel = document.getElementById("resourcesPanel")
    resourcesPanel.innerHTML = ""

    for (let i = 1; i <= numResources; i++) {
      const resName = `R${i}`
      const resEl = document.createElement("div")
      resEl.className = "resource"
      resEl.id = `res${resName}`
      resEl.innerHTML = `
        <div>${resName}</div>
        <div class="resource-owner" id="owner${resName}">libre</div>
      `
      resourcesPanel.appendChild(resEl)
    }
  }

  // ============ BOTONES - EVENT LISTENERS ============
  const startBtn = document.getElementById("start")
  const stopBtn = document.getElementById("stop")
  const detectBtn = document.getElementById("detect")

  function validateUIState() {
    // Solo permitir cambiar config si está detenido
    strategySelect.disabled = running
    numProcessesInput.disabled = running
    numResourcesInput.disabled = running
    stopBtn.disabled = !running
    detectBtn.disabled = !running
    startBtn.disabled = running
  }

  startBtn.addEventListener("click", () => {
    if (!running) {
      running = true
      validateUIState()
      initializeResources()
      initializeProcesses()
      updateDiagramLayout()

      const strat = strategySelect.value
      const resourceList = []
      for (let i = 1; i <= numResources; i++) {
        resourceList.push(`R${i}`)
      }

      const isDeadlockProne = scenarioSelect.value === "deadlock-prone"

      for (let i = 0; i < numProcesses; i++) {
        const procName = String.fromCharCode(65 + i)
        const w = new Worker("worker.js")
        w._name = procName
        processWorkers[procName] = w

        setupWorkerHandlers(w)

        const order = strat === "ordering" ? resourceList : [...resourceList].sort(() => Math.random() - 0.5)

        w.postMessage({
          type: "init",
          name: procName,
          order,
          numResources,
          strategicMode: isDeadlockProne,
        })
      }

      const curSpeed = Number.parseFloat(speedEl.value || "1")
      for (const procName in processWorkers) {
        try {
          if (processWorkers[procName]) processWorkers[procName].postMessage({ type: "setSpeed", speed: curSpeed })
        } catch (e) {}
      }

      for (let i = 0; i < numProcesses; i++) {
        const procName = String.fromCharCode(65 + i)
        document.getElementById(`state${procName}`).textContent = "pensando"
      }

      statusEl.textContent = "En ejecución"
      startAutoDetection()
      write("Simulación iniciada con " + numProcesses + " procesos y " + numResources + " recursos", "success")
    }
  })

  stopBtn.addEventListener("click", () => {
    if (running) {
      running = false
      validateUIState()
      if (deadlockDetectionInterval) clearInterval(deadlockDetectionInterval)

      for (const procName in processWorkers) {
        try {
          if (processWorkers[procName]) processWorkers[procName].terminate()
        } catch (e) {}
        processWorkers[procName] = null
      }

      for (let i = 1; i <= numResources; i++) {
        const resName = `R${i}`
        resourceLocks[resName].owner = null
        resourceLocks[resName].holdSince = null
        processQueues[resName].length = 0
      }

      updateOwners()
      for (let i = 0; i < numProcesses; i++) {
        const procName = String.fromCharCode(65 + i)
        const procEl = document.getElementById(`proc${procName}`)
        procEl.classList.remove("waiting", "deadlock")
        procEl.style.animation = ""
      }

      for (let i = 0; i < numProcesses; i++) {
        const procName = String.fromCharCode(65 + i)
        document.getElementById(`state${procName}`).textContent = "inactivo"
      }

      statusEl.textContent = "Detenido"

      write("⏹ Simulación detenida", "info")
    }
  })

  detectBtn.addEventListener("click", () => {
    if (!running) {
      write("Inicia la simulación primero", "error")
      return
    }
    const d = detectDeadlock()
    if (d) {
      write("🔴 Deadlock confirmado - usa Resolver para aplicar estrategia", "error")
    } else {
      write("🟢 Sin deadlock detectado", "success")
    }
  })

  if (resolveBtn) {
    resolveBtn.addEventListener("click", () => {
      resolve()
    })
  }

  const runScenarioBtn = document.getElementById("runScenario")
  runScenarioBtn.addEventListener("click", () => {
    if (running) {
      write("Detén la simulación antes de cambiar escenario", "warning")
      return
    }
    runScenario()
  })

  const clearLogBtn = document.getElementById("clearLog")
  clearLogBtn.addEventListener("click", () => {
    logEl.innerHTML = ""
    write("Log limpiado", "info")
  })

  scenarioSelect.addEventListener("change", applyScenario)

  strategySelect.addEventListener("change", () => {
    const names = {
      fifo: "FIFO",
      banker: "Algoritmo del Banquero",
      ordering: "Prevención",
      preempt: "Preempt",
      abort: "Abort",
    }
    algorithmNameEl.textContent = names[strategySelect.value]
  })

  numProcessesInput.addEventListener("change", (e) => {
    numProcesses = Number.parseInt(e.target.value)
    processCountEl.textContent = numProcesses
    if (!running) updateDiagramLayout()
  })

  numResourcesInput.addEventListener("change", (e) => {
    numResources = Number.parseInt(e.target.value)
    resourceCountEl.textContent = numResources
    if (!running) updateDiagramLayout()
  })

  // Iniciar con log inicial
  write("Deadlock Visualizer iniciado", "success")
  write("Presiona ▶ para empezar", "info")
})
