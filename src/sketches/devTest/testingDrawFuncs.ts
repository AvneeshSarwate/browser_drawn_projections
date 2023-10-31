//a repository of code chunks for testing to copy/paste back into the LivecodeHolder code() func



const basicTest = () => {
  // reg(0).activate().debug = true
  // reg(1).activate()
  // // reg(0).draw2 = cornerPts


  // //todo API - streamline assinging stateful animations to regions (avoid specifying index twice)
  // //need some api for these so you don't have to specify
  // //the region index twice (once on creation and once on assignment)
  // const dots = new a.PerimiterDots(reg(0), 10).anim(2.52)
  // reg(0).animationSeq = aseq([dots, rl, lr])

  //modularize creation of a sequence into a function in a DIFFERENT FILE - module can be livecoded
  // groupedAnimation0(appState, reg(1))

  " " //a way to add "spacing" when reading eval'd code

  // testCancel()


  // const ec = new EventChop<{ x: number }>()


  //todo API - create cleaner way to set up mouse/keyboard mappings on p5 sketch, make it work with fullscreen
  // threeCanvas.onmousedown = (ev) => {
  //   const normalizedX = ev.clientX / threeCanvas.clientWidth
  //   ec.ramp(1, { x: normalizedX * p5i.width })
  //   console.log("mouse down")
  // }

  // const chopDraw = (p5: p5) => {
  //   ec.samples().forEach((s) => {
  //     p5.push()
  //     p5.fill(255, 0, 0)
  //     p5.circle(s.x, s.val * 700, 130)
  //     p5.pop()
  //     // console.log("chop draw", s.val, r)
  //   })
  // }
  // appState.drawFunctions.push(chopDraw)

  /**
   * todo API - need to streamline api for patterns - goal is to be able
   * to very quickly livecode different x/y streams to change
   * instancing behavior of dots
   * 
   * idea - "patterns" are just functions that take a phase value
   *        in [0, 1] and return an output [0, 1]
   * 
   * lets you easily create variations cyclic patterns
   */

  // window.addEventListener('keydown', (ev) => {
  //   if (ev.key === 'p') {
  //     appState.paused = !appState.paused
  //   }
  // })

  // const patternDraw = (p5: p5) => {
  //   const sin2 = (p: number) => sin(p * 2.5)
  //   xyZip(Date.now() / 10000, sin2, cos, 20).forEach((pt) => {
  //     p5.circle(norm(pt).x, norm(pt).y, 30)
  //   })
  // }
  // appState.drawFunctions.push(patternDraw)
  // console.log("code ran")

  // vidAudioBands.drawCallback = (low, mid, high) => {
  //   p5i.push()
  //   p5i.fill(255, 0, 0)
  //   p5i.rect(300, 0, low * 300, 100)
  //   p5i.rect(300, 100, mid * 300, 100)
  //   p5i.rect(300, 200, high * 300, 100)
  //   p5i.pop()
  // }
  // appState.drawFunctions.push(() => vidAudioBands.draw())

  // waveAudioBands.drawCallback = (low, mid, high) => {
  //   p5i.push()
  //   p5i.fill(0, 255, 0)
  //   p5i.rect(600, 0, low * 300, 100)
  //   p5i.rect(600, 100, mid * 300, 100)
  //   p5i.rect(600, 200, high * 300, 100)
  //   p5i.pop()
  // }
  // appState.drawFunctions.push(() => waveAudioBands.draw())

  // console.log("input exists", midiInputs.get('IAC Driver Bus 1'))
  // midiInputs.get('IAC Driver Bus 1')?.onAllNoteOn((note) => {
  //   console.log("note on", note)
  // })
}


const three5performanceCheck = () => {
  // const wave = (t: number) => sin(now() / 20 + t * 4) * 400 + 200
  // const sinColor = (t: number) => [sin(now() / 10 + t * 4), sin(now() / 10 + t * 3), 0]
        
  // appState.drawFunctions.push(() => {
  //   let n = 100
  //   // return //todo performance - why does enabling this slow down the framerate so much?
  //   const sinX = steps(0, 1, n).map(wave)
  //   three5i!!.useStroke = false
  //   for (let i = 0; i < n; i++) {
  //     const c1 = new THREE.Color(...sinColor(i / n))
  //     const c2 = new THREE.Color(...sinColor((i + 1) / n))

  //     const mat2 = three5i!!.createGradientMaterial(c1, c2, 0, 10, 0)
  //     three5i!!.setMaterial(mat2)
  //     three5i!!.circle(i/n * 1280, sinX[i], 40)
  //   }
  // })

  // for (let c = 0; c < 5; c++) {
  //   let n = 100
  //   appState.drawFunctions.push(() => {
  //     // return
  //     const sinX = steps(0, 1, n).map(wave)
  //     const pts = steps(0, n, n).map(n => Math.round(n)).map(i => new THREE.Vector2(i/n * 1280, sinX[i] - c * 10 + 100))

  //     three5i!!.curve(pts)
  //   })
  // }

  // appState.drawFunctions.push(_ => three5i!!.render(appState.threeRenderer!!))
}
