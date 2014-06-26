#! /bin/sh
# Batch convert CSV SSH data to image-format SSH data.

if [ -z "$FMT" ]; then
    FMT=jpg
fi

if [ "$FMT" = "png" ]; then
    gcc -DBITS_BEF_DEC=8 -DBITS_AFT_DEC=7 csvtotga.c -o csvtotga
else # JPG
    gcc -DBITS_BEF_DEC=6 -DBITS_AFT_DEC=2 csvtotga.c -o csvtotga
fi

trap "rm csvtotga" EXIT

if [ -n "$FAST" ]; then
  ./csvtotga <../data/SSH/ssh_19921014.dat | \
    convert tga:- ../data/${FMT}ssh/ssh_19921014.${FMT}

  # Note: Web browsers cannot reliably work with PNGs that has an
  # unassociated alpha channel, but this would be the option to
  # provide for a PNG with unassociated alpha: -define
  # tiff:alpha=unassociated

  # Also note that it is currently not possible for a web browser to
  # reliably read arbitrary data out of the alpha channel of an image.
  exit
fi

for date in 19921014 19921021 19921028 19921104 19921111 19921118 19921125 19921202 19921209 19921216 19921223 19921230 19930106 19930113 19930120 19930127 19930203 19930210 19930217 19930224 19930303 19930310 19930317 19930324 19930331 19930407 19930414 19930421 19930428 19930505 19930512 19930519 19930526 19930602 19930609 19930616 19930623 19930630 19930707 19930714 19930721 19930728 19930804 19930811 19930818 19930825 19930901 19930908 19930915 19930922 19930929 19931006; do
  ./csvtotga <../data/SSH/ssh_${date}.dat | \
    convert tga:- ../data/${FMT}ssh/ssh_${date}.${FMT}
done
