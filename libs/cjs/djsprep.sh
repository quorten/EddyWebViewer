#! /bin/sh
# Prepare JavaScript files for jsdoc by removing import statements.

# Get the directory where the script files reside.
OLDPWD=`pwd`
if cd `dirname $0`; then
  I=`pwd`
  cd $OLDPWD || exit 1
else
  exit 1
fi

. ${I}/getiofiles.sh

sed -e '/^import\(.*\)";$/d' "$INPUT" > "$OUTPUT"
