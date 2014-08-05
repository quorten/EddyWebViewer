#! /bin/sh
# Convert cjs to JavaScript with import statements.

# Get the directory where the script files reside.
OLDPWD=`pwd`
if cd `dirname $0`; then
  I=`pwd`
  cd $OLDPWD || exit 1
else
  exit 1
fi

. ${I}/getiofiles.sh

sed -f ${I}/js_prefixes.sed "$INPUT" | \
  $CPP -C -DCJS_JS_TARGET -include ${I}/basic_strip_vartype.h | \
  sed -e '/^#.*$/d' > "$OUTPUT"
