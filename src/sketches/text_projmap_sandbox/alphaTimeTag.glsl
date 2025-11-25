
// Example Pixel Shader

uniform float drawTime;

out vec4 fragColor;
void main()
{
	vec4 inCol = texture(sTD2DInputs[0], vUV.st);
    float alphaTime = inCol.a > 0 ? drawTime : 0;
	vec4 color = vec4(inCol.rgb, alphaTime);
	fragColor = TDOutputSwizzle(color);
}
