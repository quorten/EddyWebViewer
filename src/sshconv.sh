#! /bin/sh
# Batch convert CSV SSH data to image-format SSH data.

setclass()
{
  # NOTE: From my experience, breaking up a number and storing its
  # additional bits in separate color channels does not work very well
  # with JPEG/video compression.  Thus, only 8-bit formats are used for
  # JPEG and video targets.

  # 7 bits after the decimal for SSH data points is the maximum useful
  # level of detail for 1440x721 SSH images.  For higher resolution SSH
  # images, though, a larger number of bits after the decimal would
  # become relevant.

  case "$CLASS" in
    pngssh)
      FMT=png
      BITS_BEF_DEC=8
      BITS_AFT_DEC=7
    ;;
    jpgssh)
      FMT=jpg
      BITS_BEF_DEC=6
      BITS_AFT_DEC=2
      NOISE_MARGIN=24
    ;;
    # Pre-Video SSH
    pvssh)
      FMT=png
      BITS_BEF_DEC=6
      BITS_AFT_DEC=2
      NOISE_MARGIN=24
    ;;
    *) echo "$0: Unknown SSH conversion class." >/dev/stderr; exit 1 ;;
  esac

  if [ -z "$NOISE_MARGIN" ]; then
    NOISE_MARGIN=0
  fi
}

cc -O3 csvtotga.c -o csvtotga
trap "rm csvtotga" EXIT

if [ -z "$CLASSES" ]; then
  CLASSES=pngssh
fi
if [ -n "$FAST" ]; then
  DATES=19921014
else
  DATES=`cat ../data/dates.dat`
fi

# Write out the format files for each SSH conversion class.
for CLASS in $CLASSES; do
  setclass
  mkdir -p ../data/${CLASS}
  cat >../data/${CLASS}/format.json <<EOF
{
  "format": ${FMT},
  "bitsBefDec": ${BITS_BEF_DEC},
  "bitsAftDec": ${BITS_AFT_DEC},
  "noiseMargin": ${NOISE_MARGIN}
}
EOF
done

# Convert each SSH frame for each conversion class.
for date in $DATES; do
  for CLASS in $CLASSES; do
    setclass
    ./csvtotga $BITS_BEF_DEC.$BITS_AFT_DEC -m$NOISE_MARGIN \
      <../data/SSH/ssh_${date}.dat | \
      convert tga:- ../data/${CLASS}/ssh_${date}.${FMT}
  done
  echo Finished date ${date}.

  # Note: Web browsers cannot reliably work with PNGs that has an
  # unassociated alpha channel, but this would be the option to
  # provide for a PNG with unassociated alpha:
  # -define tiff:alpha=unassociated

  # Also note that it is currently not possible for a web browser to
  # reliably read arbitrary data out of the alpha channel of an image.
  # (In the future, web browsers might be fixed to support this,
  # though.)
done
