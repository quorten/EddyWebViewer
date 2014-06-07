/* C class style.  */

struct MyClass_tag {
  int value;
};
typedef struct MyClass_tag MyClass;

void MyClass_init(MyClass *ctx, int value) {
  ctx.value = value;
}

void MyClass_close(void) {
}

int MyClass_getValue(MyClass *ctx) {
  return ctx.value;
}

char *plainFunction(void) {
  return "Hello!";
}
