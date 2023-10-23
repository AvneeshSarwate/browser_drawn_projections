//from https://github.com/davidfig/fps/blob/master/fps.ts

export interface FPSOptions {
    meter?: boolean
    side?: string
    FPS?: number
    tolerance?: number
    meterWidth?: number
    meterHeight?: number
    meterLineHeight?: number
    styles?: Partial<CSSStyleDeclaration>
    stylesFPS?: Partial<CSSStyleDeclaration>
    stylesMeter?: Partial<CSSStyleDeclaration>
    text?: string
    colorGreen?: Color
    colorOrange?: Color
    colorRed?: Color
    zIndex?: number
}

export const defaultFPSOptions: FPSOptions = {
    meter: true,
    side: 'bottom-right',
    FPS: 60,
    tolerance: 1,
    meterWidth: 100,
    meterHeight: 25,
    meterLineHeight: 4,
    styles: {
        'background': 'rgba(0, 0, 0, 0.5)',
        'color': 'white',
    },
    stylesFPS: {
        'padding': '0.1em 0.5em',
    },
    text: ' FPS',
    colorGreen: '#00ff00',
    colorOrange: '#ffa500',
    colorRed: '#ff0000',
    zIndex: 1000,
}

/** Use #FFFFFF format for colors to ensure proper mixing of colors */
export type Color = string

export class FPS {
    options: FPSOptions
    div: HTMLDivElement
    private lastTime: number = 0
    private frameNumber: number = 0
    private lastFPS: number = 0
    private meterCanvas: HTMLCanvasElement
    private meterContext: CanvasRenderingContext2D
    private fpsSpan: HTMLSpanElement

    /**
     * @param [options]
     * @param [options.meter=true] - include a meter with the FPS
     * @param [options.side=bottom-right] - include any combination of left/right and top/bottom
     * @param [options.FPS=60] - desired FPS
     * @param [options.tolerance=1] - minimum tolerance for fluctuations in FPS number
     * @param [options.meterWidth=100] - width of meter div
     * @param [options.meterHeight=25] - height of meter div
     * @param [options.meterLineHeight=4] - height of meter line
     * @param [options.styles] - CSS styles to apply to the div (in javascript format)
     * @param [options.stylesFPS] - CSS styles to apply to the FPS text (in javascript format)
     * @param [options.stylesMeter] - CSS styles to apply to the FPS meter (in javascript format)
     * @param [options.text=" FPS"] - change the text to the right of the FPS
     * @param [options.colorGreen=#ffa500] green (good) color on meter
     * @param [options.colorRed = #ff0000] red (bad) color on meter
     * @param [options.zIndex = 1000] zIndex to assign to div
     */
    constructor(options: FPSOptions = {}) {
        this.options = { ...defaultFPSOptions, ...options }
        this.div = document.createElement('div')
        this.findParent(this.options.side || 'bottom-right').appendChild(this.div)
        this.style(this.div, this.options.styles)
        this.createDivFPS()
        if (this.options.meter) {
            this.createDivMeter()
        }
    }

    /** desired FPS */
    get fps(): number {
        return this.options.FPS
    }
    set fps(value) {
        this.options.FPS = value
    }

    /** remove meter from DOM */
    remove() {
        this.div.remove()
    }

    /** meter (the FPS graph) is on or off */
    get meter(): boolean {
        return this.options.meter
    }
    set meter(value) {
        if (value) {
            this.createDivMeter()
        }
        else if (this.meterCanvas) {
            this.meterCanvas.style.display = 'none'
        }
    }

    private style(div: HTMLElement, style: Partial<CSSStyleDeclaration>) {
        for (const entry in style) {
            div.style[entry] = style[entry]
        }
    }

    private createDivFPS() {
        const divFPS = document.createElement('div')
        this.style(divFPS, this.options.stylesFPS)
        this.div.appendChild(divFPS)
        this.fpsSpan = document.createElement('span')
        divFPS.appendChild(this.fpsSpan)
        const span = document.createElement('span')
        divFPS.appendChild(span)
        span.innerText = this.options.text
    }

    private createDivMeter() {
        if (!this.meterCanvas) {
            this.meterCanvas = document.createElement('canvas')
            this.div.appendChild(this.meterCanvas)
            this.meterCanvas.width = this.options.meterWidth
            this.meterCanvas.height = this.options.meterHeight
            this.meterCanvas.style.width = this.options.meterWidth + 'px'
            this.meterCanvas.style.height = this.options.meterHeight + 'px'
            this.style(this.meterCanvas, this.options.stylesMeter)
            this.meterContext = this.meterCanvas.getContext('2d', { willReadFrequently: true })
        }
        else {
            this.meterCanvas.style.display = 'block'
        }
    }

    /** call this at the end of the frame to calculate FPS */
    frame() {
        this.frameNumber++
        const currentTime = performance.now() - this.lastTime

        // skip large differences to remove garbage
        if (currentTime > 500) {
            if (this.lastTime !== 0) {
                this.lastFPS = Math.floor(this.frameNumber / (currentTime / 1000))
                if (this.lastFPS > this.options.FPS ||
                    (
                        this.lastFPS >= this.options.FPS - this.options.tolerance &&
                        this.lastFPS <= this.options.FPS + this.options.tolerance
                    )
                ) {
                    this.lastFPS = this.options.FPS
                }
            }
            this.lastTime = performance.now()
            this.frameNumber = 0
        }
        this.fpsSpan.innerText = this.lastFPS === 0 ? '--' : this.lastFPS + ''
        if (this.options.meter && this.lastFPS !== 0) {
            this.meterUpdate(this.lastFPS / this.options.FPS)
        }
    }

    /**
     * From https://github.com/bgrins/TinyColor#readme
     * Mix two RGP colors
     * @param color1 - first color
     * @param color2 - second color
     * @param percent - percent to mix
     */
    private mix(color1: Color, color2: Color, percent: number): string {
        const rgb = (color: Color) => {
            return {
                r: parseInt(color.substr(1, 2), 16),
                g: parseInt(color.substr(3, 2), 16),
                b: parseInt(color.substr(5, 2), 16),
            }
        }
        const digit2 = (n: number): string => {
            n = Math.floor(n)
            if (n.toString().length === 1) {
                return '0' + n.toString(16)
            } else {
                return n.toString(16)
            }
        }
        const rgb1 = rgb(color1)
        const rgb2 = rgb(color2)

        const r = digit2(rgb1.r * percent + rgb2.r * (1 - percent))
        const g = digit2(rgb1.g * percent + rgb2.g * (1 - percent))
        const b = digit2(rgb1.b * percent + rgb2.b * (1 - percent))

        return `#${r}${g}${b}`
    }

    private meterUpdate(percent: number) {
        const data = this.meterContext.getImageData(0, 0, this.meterCanvas.width, this.meterCanvas.height)
        this.meterContext.putImageData(data, -1, 0)
        this.meterContext.clearRect(this.meterCanvas.width - 1, 0, 1, this.meterCanvas.height)
        if (percent <= 0.5) {
            this.meterContext.fillStyle = this.mix(this.options.colorRed, this.options.colorOrange, 1 - percent * 2)
        }
        else {
            this.meterContext.fillStyle = this.mix(this.options.colorGreen, this.options.colorOrange, (percent - 0.5) * 2)
        }
        const height = (this.meterCanvas.height - this.options.meterLineHeight) * (1 - percent)
        this.meterContext.fillRect(this.meterCanvas.width - 1, height, 1, this.options.meterLineHeight)
    }

    /**
     * find the parent div for one of the corners
     * @param side side to place the panel (combination of right/left and bottom/top)
     * @return {HTMLElement}
     */
    private findParent(side: string): HTMLElement {
        const styles = []
        let name = 'yy-counter-'
        if (side.indexOf('left') !== -1) {
            name += 'left-'
            styles['left'] = 0
        }
        else {
            name += 'right-'
            styles['right'] = 0
        }
        if (side.indexOf('top') !== -1) {
            name += 'top'
            styles['top'] = 0
        }
        else {
            name += 'bottom'
            styles['bottom'] = 0
        }
        const test = document.getElementById(name)
        if (test) {
            return test
        }
        const container = document.createElement('div')
        container.id = name
        container.style.overflow = 'hidden'
        container.style.position = 'fixed'
        container.style.zIndex = this.options.zIndex.toString()
        container.style.pointerEvents = 'none'
        container.style.userSelect = 'none'
        for (let style in styles) {
            container.style[style] = styles[style]
        }
        document.body.appendChild(container)
        return container
    }
}