# Common shell script code to get input and output files.

INPUT=
OUTPUT=

while [ -n "$1" ]; do
  case "$1" in
    -o) shift; OUTPUT="$1";;
    *) INPUT="$1";;
  esac
  shift
done

if [ -z "$INPUT" -o -z "$OUTPUT" ]; then
  echo "Usage: $0 INPUT -o OUTPUT"
  exit
fi
