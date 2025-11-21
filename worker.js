let name = null
let order = ["R1", "R2"]
let running = false
let speed = 1
let numResources = 2
let strategicMode = false
const held = new Set()
const pending = {}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function log(msg) {
  postMessage({ type: "log", msg })
}

function state(s) {
  postMessage({ type: "state", state: s })
}

onmessage = (e) => {
  const m = e.data

  if (m.type === "init") {
    name = m.name || name
    order = m.order || order
    numResources = m.numResources || numResources
    strategicMode = m.strategicMode || false
    running = true
    log(`iniciado con ${order.length} recursos`)
    loop()
  } else if (m.type === "granted") {
    const r = m.resource
    if (pending[r]) {
      pending[r](true)
      delete pending[r]
    }
  } else if (m.type === "setSpeed") {
    speed = Number.parseFloat(m.speed) || speed
  } else if (m.type === "wait") {
    // notificación de espera
  } else if (m.type === "preempt") {
    const res = m.resource
    if (held.has(res)) {
      held.delete(res)
      postMessage({ type: "release", resource: res, name })
      log(`preempted: libera ${res}`)
    }
  } else if (m.type === "stop") {
    running = false
    for (const r of Array.from(held)) {
      held.delete(r)
      postMessage({ type: "release", resource: r, name })
    }
    state("ABORTED")
    close()
  }
}

async function requestResource(res) {
  postMessage({ type: "request", resource: res })
  return new Promise((resolve) => {
    pending[res] = resolve
  }).then(() => {
    held.add(res)
    return true
  })
}

async function loop() {
  while (running) {
    try {
      state("pensando")
      await sleep((800 + Math.random() * 600) / speed)

      const resourcesPerIteration = strategicMode
        ? Math.min(numResources, Math.ceil(numResources * 0.7))
        : Math.ceil(numResources * 0.6)

      for (let i = 0; i < resourcesPerIteration && i < order.length; i++) {
        const resource = order[i]
        state(`solicitando ${resource}`)
        await requestResource(resource)
        state(`posee ${order.slice(0, i + 1).join(", ")}`)
        const holdTime = strategicMode ? 800 + Math.random() * 400 : 600 + Math.random() * 600
        await sleep(holdTime / speed)
      }

      state("sección crítica ✓")
      await sleep((1200 + Math.random() * 1000) / speed)

      for (const r of Array.from(held)) {
        held.delete(r)
        postMessage({ type: "release", resource: r, name })
      }

      state("liberado")
      await sleep((200 + Math.random() * 300) / speed)
    } catch (err) {
      log(`error: ${err}`)
    }
  }

  for (const r of Array.from(held)) {
    held.delete(r)
    postMessage({ type: "release", resource: r, name })
  }
  close()
}
