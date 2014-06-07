/* Test how well `converter' can handle C/C++ files.  */

int main() {
  int x = 5, y = 4, z = 7;
  return x;
}

void
standard(onevar x) {
}

void super_bad { return 0; }

// This is a much more prototypical example.
int*compute(int a  , int b = 5, char c/* = 7 */) {
  int i;
  char_ptr_array *args = global_list.d[b];
  puts(args->d[0]);
  for (i = 0; i < 5; i++)
    a += b;
  return &(a * b);
}

void *compute2(int a, int b = 10) {
  return NULL;
}

// This is an actual C prototype!  Good luck on this one.
int compute(int a, int b);

void compute3(int a, int b, int c, int d) {
}

// Let's try some type declarations.

typedef int x;
x y;

struct y;
class z;
y * z;

w const const const ****&&* &* & &* & const
*&* & & &* &const &const*& &*&*& const strango;
vector<z> take_this;
class vector;
vector<z> try_again;
vector<int> a_cheap_converter(should, not, get, through, this);

// Maybe a C++ class can throw the converter off.
class MyClass {
protected:
  int x;
  int y;
  bool z;

public:

  MyClass(int chooser) {
    x = chooser;
    y = 0;
    z = 0;
  }

  ~MyClass() {
    puts("Shutting down!!!");
  }

  int getVals() {
    return x, y;
  }
};
