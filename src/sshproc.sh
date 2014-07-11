#! /bin/sh
# Batch convert CSV SSH data to image-format SSH data.

if [ -z "$FMT" ]; then
    FMT=jpg
fi

if [ "$FMT" = "png" ]; then
    cc -DBITS_BEF_DEC=8 -DBITS_AFT_DEC=7 csvtotga.c -o csvtotga
else # JPG
    cc -DBITS_BEF_DEC=6 -DBITS_AFT_DEC=2 csvtotga.c -o csvtotga
fi

trap "rm csvtotga" EXIT

if [ -n "$FAST" ]; then
  DATES=19921014
else
  DATES=`cat ../data/dates.dat`
fi

for date in $DATES; do
  ./csvtotga <../data/SSH/ssh_${date}.dat | \
    convert tga:- ../data/${FMT}ssh/ssh_${date}.${FMT}

  # Note: Web browsers cannot reliably work with PNGs that has an
  # unassociated alpha channel, but this would be the option to
  # provide for a PNG with unassociated alpha:
  # -define tiff:alpha=unassociated

  # Also note that it is currently not possible for a web browser to
  # reliably read arbitrary data out of the alpha channel of an image.
  # (In the future, web browsers might be fixed to support this,
  # though.)
done
