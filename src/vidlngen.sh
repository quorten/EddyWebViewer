#! /bin/sh
# Take dated SSH frames and create symlinks to the frames with a
# contiguous numbering scheme.  The resulting frames can then be used
# to encode a compressed video sequence.

if [ -z "$CLASS" ]; then
  CLASS=jpgssh
  FMT=jpg
fi

# FRAMELIST=`ls $CLASS | sed -e '/^format.json$/d' | sort`
FRAMELIST=`cat dates.dat | sed -e 's/^\(.*\)$/ssh_\1.'$FMT'/g'`
NUMFRAMES=`echo "$FRAMELIST" | wc -l`
mkdir vidgen
cd vidgen
i=0
while [ $i -lt $NUMFRAMES ]; do
  i=$((i + 1))
  FRAME=`echo "$FRAMELIST" | sed -ne ${i}p`
  FRNUM=`printf %05d $i`
  ln ../$CLASS/$FRAME ssh_$FRNUM.$FMT
done
