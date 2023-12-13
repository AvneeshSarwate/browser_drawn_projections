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

export function setUpColorDatGui(colorObj?: colorMap) {
  const datGui = new dat.GUI()
  const defaultColors = {
    color0: tinycolor.random().toHsv(),
    color1: tinycolor.random().toHsv(),
    color2: tinycolor.random().toHsv(),
    color3: tinycolor.random().toHsv(),
    color4: tinycolor.random().toHsv()
  }
  const colors = colorObj ? colorObj : defaultColors
  datGui.remember(colors)

  ;[0, 1, 2, 3, 4].forEach((i) => {
    const col = 'color' + i
    datGui.addColor(colors, col)

    setUpComplementsData(colors, i)
    setUpComplementsUI(datGui, colors, i)
  })
  console.log("COLORS", colors)
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