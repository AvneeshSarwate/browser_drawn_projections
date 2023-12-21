import tinycolor from 'tinycolor2'
import * as dat from 'dat.gui'
import spectral from 'spectral.js'

const colorVariationFuncs = ['triad', 'tetrad', 'monochromatic', 'analogous', 'splitcomplement']
const getColorKey = (varName: string, colInd: number, varInd: number) =>
  'col' + colInd + varName.slice(0, 3) + varInd
const getVarsStem = (varName: string, colInd: number) => 'col' + colInd + varName.slice(0, 3)

function setUpComplementsData(colors: colorMap, ind: number) {

  const col = tinycolor(colors['color' + ind] as tinycolor.ColorFormats.HSVA)

  colorVariationFuncs.forEach((func) => {

    //@ts-ignore
    const colVars = col[func]()

    colVars.forEach((_: tinycolor.Instance, j: number) => {
      colors[getColorKey(func, ind, j)] = colVars[j].toHsv()
    })
  })
}

type colorMap = {
  [key: string]: tinycolor.ColorFormats.HSVA | (() => void)
}

function setUpComplementsUI(datGui: dat.GUI, colors: colorMap, ind: number) {
  const allVarsFolder = datGui.addFolder('colorVars-' + ind)
  colorVariationFuncs.forEach((func) => {
    const variationFolder = allVarsFolder.addFolder(func)
    const variationsStem = getVarsStem(func, ind)

    const variationKeys = Object.keys(colors).filter((key) => key.includes(variationsStem))
    variationKeys.forEach((varKey) => {
      variationFolder.addColor(colors, varKey).listen()
    })

    colors[variationsStem + '-reset'] = () => {

      //@ts-ignore
      const variations = tinycolor(colors['color' + ind])[func]()

      variations.forEach((varCol: tinycolor.Instance, j: number) => {
        colors[variationsStem + j] = varCol.toHsv()
      })
    }
    variationFolder.add(colors, variationsStem + '-reset')
  })
  //add reset all vars?
}

export function setUpColorDatGui(savedColors?: colorChoices): { datGui: dat.GUI, colors: colorChoices } {

  const datGui = new dat.GUI()
  const defaultColors = {
    color0: tinycolor.random().toHsv(),
    color1: tinycolor.random().toHsv(),
    color2: tinycolor.random().toHsv(),
    color3: tinycolor.random().toHsv(),
    color4: tinycolor.random().toHsv()
  }
  const colors = savedColors ?? defaultColors
  datGui.remember(colors)

  ;[0, 1, 2, 3, 4].forEach((i) => {
    const col = 'color' + i
    datGui.addColor(colors, col)

    if(!savedColors) setUpComplementsData(colors, i)
    setUpComplementsUI(datGui, colors, i)
  })
  console.log("COLORS", colors)

  //@ts-ignore
  return { datGui, colors }
}

export function mixColor(col1: tinycolor.ColorFormats.HSVA, col2: tinycolor.ColorFormats.HSVA, ratio: number) {
  const col1Rgb = tinycolor(col1).toRgb()
  const col2Rgb = tinycolor(col2).toRgb()
  const col1Str = `rgb(${col1Rgb.r}, ${col1Rgb.g}, ${col1Rgb.b})`
  const col2Str = `rgb(${col2Rgb.r}, ${col2Rgb.g}, ${col2Rgb.b})`
  const mixed = spectral.mix(col1Str, col2Str, ratio, spectral.RGBA)
  return tinycolor(mixed)
}

export function palette(col1: tinycolor.ColorFormats.HSVA, col2: tinycolor.ColorFormats.HSVA, count: number) {
  const col1Rgb = tinycolor(col1).toRgb()
  const col2Rgb = tinycolor(col2).toRgb()
  const col1Str = `rgb(${col1Rgb.r}, ${col1Rgb.g}, ${col1Rgb.b})`
  const col2Str = `rgb(${col2Rgb.r}, ${col2Rgb.g}, ${col2Rgb.b})`
  const palette = spectral.palette(col1Str, col2Str, count, spectral.RGBA)
  return palette.map((col) => tinycolor(col))
}

export function toRgb(col: tinycolor.ColorFormats.HSVA) {
  return tinycolor(col).toRgb()
}

export type colorChoices = {
  color0: tinycolor.ColorFormats.HSVA,
  color1: tinycolor.ColorFormats.HSVA,
  color2: tinycolor.ColorFormats.HSVA,
  color3: tinycolor.ColorFormats.HSVA,
  color4: tinycolor.ColorFormats.HSVA,
  col0tri0: tinycolor.ColorFormats.HSVA,
  col0tri1: tinycolor.ColorFormats.HSVA,
  col0tri2: tinycolor.ColorFormats.HSVA,
  col0tet0: tinycolor.ColorFormats.HSVA,
  col0tet1: tinycolor.ColorFormats.HSVA,
  col0tet2: tinycolor.ColorFormats.HSVA,
  col0tet3: tinycolor.ColorFormats.HSVA,
  col0mon0: tinycolor.ColorFormats.HSVA,
  col0mon1: tinycolor.ColorFormats.HSVA,
  col0mon2: tinycolor.ColorFormats.HSVA,
  col0mon3: tinycolor.ColorFormats.HSVA,
  col0mon4: tinycolor.ColorFormats.HSVA,
  col0mon5: tinycolor.ColorFormats.HSVA,
  col0ana0: tinycolor.ColorFormats.HSVA,
  col0ana1: tinycolor.ColorFormats.HSVA,
  col0ana2: tinycolor.ColorFormats.HSVA,
  col0ana3: tinycolor.ColorFormats.HSVA,
  col0ana4: tinycolor.ColorFormats.HSVA,
  col0ana5: tinycolor.ColorFormats.HSVA,
  col0spl0: tinycolor.ColorFormats.HSVA,
  col0spl1: tinycolor.ColorFormats.HSVA,
  col0spl2: tinycolor.ColorFormats.HSVA,
  col1tri0: tinycolor.ColorFormats.HSVA,
  col1tri1: tinycolor.ColorFormats.HSVA,
  col1tri2: tinycolor.ColorFormats.HSVA,
  col1tet0: tinycolor.ColorFormats.HSVA,
  col1tet1: tinycolor.ColorFormats.HSVA,
  col1tet2: tinycolor.ColorFormats.HSVA,
  col1tet3: tinycolor.ColorFormats.HSVA,
  col1mon0: tinycolor.ColorFormats.HSVA,
  col1mon1: tinycolor.ColorFormats.HSVA,
  col1mon2: tinycolor.ColorFormats.HSVA,
  col1mon3: tinycolor.ColorFormats.HSVA,
  col1mon4: tinycolor.ColorFormats.HSVA,
  col1mon5: tinycolor.ColorFormats.HSVA,
  col1ana0: tinycolor.ColorFormats.HSVA,
  col1ana1: tinycolor.ColorFormats.HSVA,
  col1ana2: tinycolor.ColorFormats.HSVA,
  col1ana3: tinycolor.ColorFormats.HSVA,
  col1ana4: tinycolor.ColorFormats.HSVA,
  col1ana5: tinycolor.ColorFormats.HSVA,
  col1spl0: tinycolor.ColorFormats.HSVA,
  col1spl1: tinycolor.ColorFormats.HSVA,
  col1spl2: tinycolor.ColorFormats.HSVA,
  col2tri0: tinycolor.ColorFormats.HSVA,
  col2tri1: tinycolor.ColorFormats.HSVA,
  col2tri2: tinycolor.ColorFormats.HSVA,
  col2tet0: tinycolor.ColorFormats.HSVA,
  col2tet1: tinycolor.ColorFormats.HSVA,
  col2tet2: tinycolor.ColorFormats.HSVA,
  col2tet3: tinycolor.ColorFormats.HSVA,
  col2mon0: tinycolor.ColorFormats.HSVA,
  col2mon1: tinycolor.ColorFormats.HSVA,
  col2mon2: tinycolor.ColorFormats.HSVA,
  col2mon3: tinycolor.ColorFormats.HSVA,
  col2mon4: tinycolor.ColorFormats.HSVA,
  col2mon5: tinycolor.ColorFormats.HSVA,
  col2ana0: tinycolor.ColorFormats.HSVA,
  col2ana1: tinycolor.ColorFormats.HSVA,
  col2ana2: tinycolor.ColorFormats.HSVA,
  col2ana3: tinycolor.ColorFormats.HSVA,
  col2ana4: tinycolor.ColorFormats.HSVA,
  col2ana5: tinycolor.ColorFormats.HSVA,
  col2spl0: tinycolor.ColorFormats.HSVA,
  col2spl1: tinycolor.ColorFormats.HSVA,
  col2spl2: tinycolor.ColorFormats.HSVA,
  col3tri0: tinycolor.ColorFormats.HSVA,
  col3tri1: tinycolor.ColorFormats.HSVA,
  col3tri2: tinycolor.ColorFormats.HSVA,
  col3tet0: tinycolor.ColorFormats.HSVA,
  col3tet1: tinycolor.ColorFormats.HSVA,
  col3tet2: tinycolor.ColorFormats.HSVA,
  col3tet3: tinycolor.ColorFormats.HSVA,
  col3mon0: tinycolor.ColorFormats.HSVA,
  col3mon1: tinycolor.ColorFormats.HSVA,
  col3mon2: tinycolor.ColorFormats.HSVA,
  col3mon3: tinycolor.ColorFormats.HSVA,
  col3mon4: tinycolor.ColorFormats.HSVA,
  col3mon5: tinycolor.ColorFormats.HSVA,
  col3ana0: tinycolor.ColorFormats.HSVA,
  col3ana1: tinycolor.ColorFormats.HSVA,
  col3ana2: tinycolor.ColorFormats.HSVA,
  col3ana3: tinycolor.ColorFormats.HSVA,
  col3ana4: tinycolor.ColorFormats.HSVA,
  col3ana5: tinycolor.ColorFormats.HSVA,
  col3spl0: tinycolor.ColorFormats.HSVA,
  col3spl1: tinycolor.ColorFormats.HSVA,
  col3spl2: tinycolor.ColorFormats.HSVA,
  col4tri0: tinycolor.ColorFormats.HSVA,
  col4tri1: tinycolor.ColorFormats.HSVA,
  col4tri2: tinycolor.ColorFormats.HSVA,
  col4tet0: tinycolor.ColorFormats.HSVA,
  col4tet1: tinycolor.ColorFormats.HSVA,
  col4tet2: tinycolor.ColorFormats.HSVA,
  col4tet3: tinycolor.ColorFormats.HSVA,
  col4mon0: tinycolor.ColorFormats.HSVA,
  col4mon1: tinycolor.ColorFormats.HSVA,
  col4mon2: tinycolor.ColorFormats.HSVA,
  col4mon3: tinycolor.ColorFormats.HSVA,
  col4mon4: tinycolor.ColorFormats.HSVA,
  col4mon5: tinycolor.ColorFormats.HSVA,
  col4ana0: tinycolor.ColorFormats.HSVA,
  col4ana1: tinycolor.ColorFormats.HSVA,
  col4ana2: tinycolor.ColorFormats.HSVA,
  col4ana3: tinycolor.ColorFormats.HSVA,
  col4ana4: tinycolor.ColorFormats.HSVA,
  col4ana5: tinycolor.ColorFormats.HSVA,
  col4spl0: tinycolor.ColorFormats.HSVA,
  col4spl1: tinycolor.ColorFormats.HSVA,
  col4spl2: tinycolor.ColorFormats.HSVA
}