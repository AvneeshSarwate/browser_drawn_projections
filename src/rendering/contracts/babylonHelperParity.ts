import type * as ShaderFXGL from '../babylonGL/shaderFXBabylon_GL'
import type * as Power2DGL from '../babylonGL/power2d'
import type * as ShaderFXWGSL from '../shaderFXBabylon'
import type * as Power2DWGSL from '../power2d'
import type {
  CanvasPaintCtorContract,
  CanvasTextureCtorContract,
  CirclePtsContract,
  CreatePower2DSceneContract,
  FeedbackNodeCtorContract,
  PassthruEffectCtorContract,
  RectPtsContract,
  ShaderEffectContract,
  BatchedStyledShapeContract,
  StyledShapeContract,
} from './babylonHelperContracts'

type AssertTrue<T extends true> = T

type DescribeAssignable<Actual, Expected, Label extends string> =
  Actual extends Expected
    ? true
    : {
      __error__: Label
      expected: Expected
      actual: Actual
      missingKeys: Exclude<keyof Expected, keyof Actual>
      extraKeys: Exclude<keyof Actual, keyof Expected>
    }

type _ShaderEffectWGSL = AssertTrue<DescribeAssignable<
  ShaderFXWGSL.ShaderEffect,
  ShaderEffectContract<ShaderFXWGSL.ShaderInputs>,
  'ShaderEffect WGSL'
>>
type _ShaderEffectGL = AssertTrue<DescribeAssignable<
  ShaderFXGL.ShaderEffect,
  ShaderEffectContract<ShaderFXGL.ShaderInputs>,
  'ShaderEffect GL'
>>

type _CanvasPaintWGSL = AssertTrue<DescribeAssignable<
  typeof ShaderFXWGSL.CanvasPaint,
  CanvasPaintCtorContract<ShaderFXWGSL.CanvasPaintInputs>,
  'CanvasPaint WGSL ctor'
>>
type _CanvasPaintGL = AssertTrue<DescribeAssignable<
  typeof ShaderFXGL.CanvasPaint,
  CanvasPaintCtorContract<ShaderFXGL.CanvasPaintInputs>,
  'CanvasPaint GL ctor'
>>

type _PassthruWGSL = AssertTrue<DescribeAssignable<
  typeof ShaderFXWGSL.PassthruEffect,
  PassthruEffectCtorContract<ShaderFXWGSL.PassthruInputs>,
  'PassthruEffect WGSL ctor'
>>
type _PassthruGL = AssertTrue<DescribeAssignable<
  typeof ShaderFXGL.PassthruEffect,
  PassthruEffectCtorContract<ShaderFXGL.PassthruInputs>,
  'PassthruEffect GL ctor'
>>

type _FeedbackWGSL = AssertTrue<DescribeAssignable<
  typeof ShaderFXWGSL.FeedbackNode,
  FeedbackNodeCtorContract<ShaderFXWGSL.ShaderEffect>,
  'FeedbackNode WGSL ctor'
>>
type _FeedbackGL = AssertTrue<DescribeAssignable<
  typeof ShaderFXGL.FeedbackNode,
  FeedbackNodeCtorContract<ShaderFXGL.ShaderEffect>,
  'FeedbackNode GL ctor'
>>

type _CanvasTextureWGSL = AssertTrue<DescribeAssignable<
  typeof Power2DWGSL.CanvasTexture,
  CanvasTextureCtorContract,
  'CanvasTexture WGSL ctor'
>>
type _CanvasTextureGL = AssertTrue<DescribeAssignable<
  typeof Power2DGL.CanvasTexture,
  CanvasTextureCtorContract,
  'CanvasTexture GL ctor'
>>

type _CreatePower2DSceneWGSL = AssertTrue<DescribeAssignable<
  typeof Power2DWGSL.createPower2DScene,
  CreatePower2DSceneContract,
  'createPower2DScene WGSL'
>>
type _CreatePower2DSceneGL = AssertTrue<DescribeAssignable<
  typeof Power2DGL.createPower2DScene,
  CreatePower2DSceneContract,
  'createPower2DScene GL'
>>

type _StyledShapeWGSL = AssertTrue<DescribeAssignable<
  Power2DWGSL.StyledShape<any, any>,
  StyledShapeContract,
  'StyledShape WGSL instance'
>>
type _StyledShapeGL = AssertTrue<DescribeAssignable<
  Power2DGL.StyledShape<any, any>,
  StyledShapeContract,
  'StyledShape GL instance'
>>

type _BatchedStyledShapeWGSL = AssertTrue<DescribeAssignable<
  Power2DWGSL.BatchedStyledShape<any>,
  BatchedStyledShapeContract,
  'BatchedStyledShape WGSL instance'
>>
type _BatchedStyledShapeGL = AssertTrue<DescribeAssignable<
  Power2DGL.BatchedStyledShape<any>,
  BatchedStyledShapeContract,
  'BatchedStyledShape GL instance'
>>

type _RectPtsWGSL = AssertTrue<DescribeAssignable<
  typeof Power2DWGSL.RectPts,
  RectPtsContract,
  'RectPts WGSL'
>>
type _RectPtsGL = AssertTrue<DescribeAssignable<
  typeof Power2DGL.RectPts,
  RectPtsContract,
  'RectPts GL'
>>

type _CirclePtsWGSL = AssertTrue<DescribeAssignable<
  typeof Power2DWGSL.CirclePts,
  CirclePtsContract,
  'CirclePts WGSL'
>>
type _CirclePtsGL = AssertTrue<DescribeAssignable<
  typeof Power2DGL.CirclePts,
  CirclePtsContract,
  'CirclePts GL'
>>

export { }
