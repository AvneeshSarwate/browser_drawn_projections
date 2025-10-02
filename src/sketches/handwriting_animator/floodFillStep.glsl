
// Example Pixel Shader

// uniform float exampleUniform;

#define SEED sTD2DInputs[0]
#define FDBK sTD2DInputs[1]

uniform int uTDPass;

out vec4 fragColor;
void main()
{
	vec4 seed = texture(SEED, vUV.st);
    vec4 fdbk = texture(FDBK, vUV.st);
    vec2 res = vec2(1920, 1080);
    vec2 coord = vUV.st * res;

    vec4 recentCol = vec4(-1);
    float rangeSize = 3;
    float rangeDev = floor(rangeSize/2);
    
    for(float x = -rangeDev; x < rangeDev+1; x++) {
        for(float y = -rangeDev; y < rangeDev+1; y++) {
            vec2 coordN = (coord + vec2(x, y)) / res;
            vec4 colTime = texture(FDBK, coordN);
            recentCol = colTime.a > recentCol.a ? colTime : recentCol;
        }
    }

    vec4 feedbackCol = fdbk.a == recentCol.a ? fdbk : recentCol;
    vec4 outCol = seed.a > 0 ? seed : feedbackCol;

    vec4 color = outCol;
	fragColor = TDOutputSwizzle(color);
}
