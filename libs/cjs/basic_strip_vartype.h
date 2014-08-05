#if 0 /* Exclude this comment from the preprocessor.  */
/* This preprocessor provides an easy way to include variable type
   information within JavaScript variable declarations.  Only types
   that correspond to basic types in C/C++/Java are defined here.  */
#endif

#define var_namespace var

#define var_int var
#define var_uint var
#define var_float var
#define var_double var
#define var_string var
#define var_bool var
#define var_object var
#define var_ctype(type) var

#define function_void function
#define function_int function
#define function_float function
#define function_double function
#define function_string function
#define function_bool function
#define function_object function

#define decl_int
#define decl_float
#define decl_double
#define decl_string
#define decl_bool
#define decl_object
