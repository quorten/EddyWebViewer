#! /bin/sh
# C preprocessor based JavaScript function inliner.

# Get the directory where the script files reside.
OLDPWD=`pwd`
if cd `dirname $0`; then
  I=`pwd`
  cd $OLDPWD || exit 1
else
  exit 1
fi

. ${I}/getiofiles.sh

sed -e 's/Math\./Math_/g' "$INPUT" | \
  $CPP -C -include ${I}/inline_math.h | \
  sed -e '/^#.*$/d' > "$OUTPUT"
