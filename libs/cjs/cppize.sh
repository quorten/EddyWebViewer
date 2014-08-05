#! /bin/sh
# Convert cjs input into C/C++ output.

# Get the directory where the script files reside.
OLDPWD=`pwd`
if cd `dirname $0`; then
  I=`pwd`
  cd $OLDPWD || exit 1
else
  exit 1
fi

. ${I}/getiofiles.sh

sed -e 's/^import\(.*\)";$/@include\1.h"/g' \
    -e 's/Math\.//g' \
    -f ${I}/js_prefixes.sed "$INPUT" | \
  $CPP -C -include ${I}/basic_static_vartype.h | \
  sed -e 's/^@include/#include/g' -e 's_^//\(.*\)\.$_/*\1.  */_g' \
    -e 's_^//\(.*\)$_/*\1 */_g' > "$OUTPUT"
