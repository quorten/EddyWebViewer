#! /bin/sh
# Smash together many JavaScript files into one using the C preprocessor.

# Get the directory where the script files reside.
OLDPWD=`pwd`
if cd `dirname $0`; then
  I=`pwd`
  cd $OLDPWD || exit 1
else
  exit 1
fi

. ${I}/getiofiles.sh

$CPP -DCJS_JS_TARGET "$INPUT" | \
  sed -e '/^#.*$/d' > "$OUTPUT"
