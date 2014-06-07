#! /bin/sh
# Prepare to smash JavaScript files by adding C preprocessor single
# include statements.

# Get the directory where the script files reside.
OLDPWD=`pwd`
if cd `dirname $0`; then
  I=`pwd`
  cd $OLDPWD || exit 1
else
  exit 1
fi

. ${I}/getiofiles.sh

PREPROC_SYM=`echo "$INPUT" | tr ./ __`

sed -e 's/^import\(.*\)";$/#include\1.hjs"/g' \
    -e "1i\#ifndef $PREPROC_SYM" \
    -e "1i\#define $PREPROC_SYM" \
    -e "\$a\#endif /* not $PREPROC_SYM */" "$INPUT" > "$OUTPUT"
