#if 0 /* Exclude this comment from the preprocessor.  */
/* This preprocessor provides an easy way to include variable type
   information within JavaScript variable declarations.  Only types
   that correspond to basic types in C/C++/Java are defined here.  */
#endif

#define var_namespace void*

#define var_int int
#define var_uint unsigned int
#define var_float float
#define var_double double
#define var_string char*
#define var_bool bool
#define var_object void*
#define var_ctype(type) type

#define function void
#define function_void void
#define function_int int
#define function_float float
#define function_double double
#define function_string char*
#define function_bool bool
#define function_object void*

#define decl_int int
#define decl_float float
#define decl_double double
#define decl_string char*
#define decl_bool bool
#define decl_object void*

enum bool_tag { false, true };
typedef enum bool_tag bool;
