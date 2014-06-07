/* C preprocessor definitions to replace JavaScript math functions
   with inline math functions that involve no function calls.  */

/* Math.impl -- Convenience function to determine which Math
   implementation is in use at run time. */
#define Math_impl "inline"

#define Math_min(x, y) ((x < y) ? x : y)
#define Math_max(x, y) ((x > y) ? x : y)
#define Math_abs(x) (Math_sign(x) * x)
#define Math_sin Math.sin
#define Math_cos Math.cos
#define Math_tan Math.tan
#define Math_asin Math.asin
#define Math_acos Math.acos
#define Math_atan Math.atan

/* Trigonometric functions with computational hint parameters.  */
#define Math_sinP Math.sin
#define Math_sinN Math.sin
#define Math_sinPN Math.sin
#define Math_cosP Math.cos
#define Math_cosN Math.cos
#define Math_cosPN Math.cos
#define Math_tanP Math.tan
#define Math_tanN Math.tan
#define Math_tanPN Math.tan
#define Math_asinP Math.asin
#define Math_asinN Math.asin
#define Math_asinPN Math.asin
#define Math_acosP Math.acos
#define Math_acosN Math.acos
#define Math_acosPN Math.acos
#define Math_atanP Math.atan
#define Math_atanN Math.atan
#define Math_atanPN Math.atan

/* Nonstandard Math functions.  */
#define Math_sign(x) (+(x >= 0) - (x < 0))

#include "comm_math.h"
