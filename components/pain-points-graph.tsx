"use client"

import { useEffect, useRef } from "react"

export function PainPointsGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Set canvas dimensions
    const setCanvasDimensions = () => {
      const container = canvas.parentElement
      if (!container) return

      canvas.width = container.clientWidth
      canvas.height = 500
    }

    setCanvasDimensions()
    window.addEventListener("resize", setCanvasDimensions)

    // Define nodes
    const nodes = [
      { id: 1, name: "Integration Complexity", x: 0, y: 0, radius: 40, color: "#3b82f6" },
      { id: 2, name: "Manual Configuration", x: 0, y: 0, radius: 35, color: "#8b5cf6" },
      { id: 3, name: "Resource Allocation", x: 0, y: 0, radius: 30, color: "#ec4899" },
      { id: 4, name: "Data Synchronization", x: 0, y: 0, radius: 38, color: "#f97316" },
      { id: 5, name: "Onboarding Time", x: 0, y: 0, radius: 42, color: "#14b8a6" },
      { id: 6, name: "Error Handling", x: 0, y: 0, radius: 25, color: "#f43f5e" },
      { id: 7, name: "Customization Limits", x: 0, y: 0, radius: 28, color: "#84cc16" },
    ]

    // Define links between nodes
    const links = [
      { source: 0, target: 1, strength: 0.7 },
      { source: 0, target: 4, strength: 0.9 },
      { source: 1, target: 2, strength: 0.5 },
      { source: 1, target: 3, strength: 0.6 },
      { source: 3, target: 5, strength: 0.4 },
      { source: 4, target: 6, strength: 0.3 },
      { source: 0, target: 6, strength: 0.2 },
    ]

    // Initialize node positions
    const initializePositions = () => {
      const centerX = canvas.width / 2
      const centerY = canvas.height / 2
      const radius = Math.min(canvas.width, canvas.height) * 0.35

      nodes.forEach((node, i) => {
        const angle = (i / nodes.length) * 2 * Math.PI
        node.x = centerX + radius * Math.cos(angle)
        node.y = centerY + radius * Math.sin(angle)
      })
    }

    initializePositions()

    // Simple force-directed layout
    const simulation = () => {
      const iterations = 100

      for (let i = 0; i < iterations; i++) {
        // Apply repulsive forces between all nodes
        for (let a = 0; a < nodes.length; a++) {
          for (let b = a + 1; b < nodes.length; b++) {
            const dx = nodes[b].x - nodes[a].x
            const dy = nodes[b].y - nodes[a].y
            const distance = Math.sqrt(dx * dx + dy * dy) || 1
            const repulsiveForce = 2000 / (distance * distance)

            const forceX = (dx / distance) * repulsiveForce
            const forceY = (dy / distance) * repulsiveForce

            nodes[a].x -= forceX
            nodes[a].y -= forceY
            nodes[b].x += forceX
            nodes[b].y += forceY
          }
        }

        // Apply attractive forces along links
        links.forEach((link) => {
          const source = nodes[link.source]
          const target = nodes[link.target]

          const dx = target.x - source.x
          const dy = target.y - source.y
          const distance = Math.sqrt(dx * dx + dy * dy) || 1
          const attractiveForce = distance * link.strength * 0.05

          const forceX = (dx / distance) * attractiveForce
          const forceY = (dy / distance) * attractiveForce

          source.x += forceX
          source.y += forceY
          target.x -= forceX
          target.y -= forceY
        })

        // Keep nodes within bounds
        nodes.forEach((node) => {
          node.x = Math.max(node.radius, Math.min(canvas.width - node.radius, node.x))
          node.y = Math.max(node.radius, Math.min(canvas.height - node.radius, node.y))
        })
      }
    }

    simulation()

    // Draw the graph
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Draw links
      ctx.lineWidth = 1
      links.forEach((link) => {
        const source = nodes[link.source]
        const target = nodes[link.target]

        ctx.beginPath()
        ctx.moveTo(source.x, source.y)
        ctx.lineTo(target.x, target.y)
        ctx.strokeStyle = `rgba(150, 150, 150, ${link.strength})`
        ctx.stroke()
      })

      // Draw nodes
      nodes.forEach((node) => {
        // Draw circle
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI)
        ctx.fillStyle = node.color
        ctx.fill()

        // Draw text
        ctx.fillStyle = "#ffffff"
        ctx.font = "12px sans-serif"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"

        // Wrap text if needed
        const words = node.name.split(" ")
        let line = ""
        const lineHeight = 14
        let y = node.y - ((words.length - 1) * lineHeight) / 2

        for (let i = 0; i < words.length; i++) {
          const testLine = line + words[i]

          if (i > 0) {
            ctx.fillText(line, node.x, y)
            line = words[i]
            y += lineHeight
          } else {
            line = testLine
          }
        }

        ctx.fillText(line, node.x, y)
      })
    }

    draw()

    // Add interactivity
    let isDragging = false
    let selectedNode: number | null = null

    canvas.addEventListener("mousedown", (e) => {
      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      // Check if a node is clicked
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]
        const dx = mouseX - node.x
        const dy = mouseY - node.y
        const distance = Math.sqrt(dx * dx + dy * dy)

        if (distance < node.radius) {
          isDragging = true
          selectedNode = i
          break
        }
      }
    })

    canvas.addEventListener("mousemove", (e) => {
      if (isDragging && selectedNode !== null) {
        const rect = canvas.getBoundingClientRect()
        const mouseX = e.clientX - rect.left
        const mouseY = e.clientY - rect.top

        nodes[selectedNode].x = mouseX
        nodes[selectedNode].y = mouseY

        draw()
      }
    })

    canvas.addEventListener("mouseup", () => {
      isDragging = false
      selectedNode = null
    })

    return () => {
      window.removeEventListener("resize", setCanvasDimensions)
    }
  }, [])

  return (
    <div className="w-full h-[500px] relative">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  )
}

