/* Convert a CSV SSH data file to a TGA image file with the SSH values
   encoded into fixed point numbers, possibly with other bit
   transformations applied.

   Two notable large scale transformations:

   * Longitude zero is shifted to the center of the image.

   * The CSV data is ordered from latitude -90 to latitude 90, whereas
     the TGA is written out as a bottom-up TGA, effectively vertically
     reversing the SSH image.

   Usage: csvtotga <INPUT.dat >OUTPUT.tga

   Data must be 1440x721 in dimensions, equirectangular projection,
   sea surface height measured in centimeters.  There should be no
   space characters before or after the commas in the CSV, newlines
   should be Unix-style, and there should be one newline character at
   the end of last row in the file.

*/

#include <stdio.h>
#include <stdint.h>

int main(void) {
  /* Write the TGA header.  */
  putchar(0); /* ID length */
  putchar(0); /* Color map type (none) */
  putchar(2); /* Image type (True Color) */

  /* No color map specification.  */
  putchar(0); putchar(0); putchar(0); putchar(0); putchar(0);

  /* `#define' is used so that `row_buffer' below is
     compiler-friendly.  */
#define WIDTH 1440
#define HEIGHT 721
#define BPP 24

  { /* Image specification.  16-bit integers are stored in little
       endian in the TGA header.  */
    uint16_t xorg = 0, yorg = 0;
#define PUT_SHORT(var) putchar(var & 0xff); putchar((var >> 8) & 0xff)
    PUT_SHORT(xorg);  PUT_SHORT(yorg);
    PUT_SHORT(WIDTH); PUT_SHORT(HEIGHT);
    putchar(BPP);
    /* Image descriptor.  When this is just set to zero the first row
       of pixels start at the bottom of the TGA and continue upward.
       Add 32 for top-down TGA.
       Add 8 if there is an 8-bit alpha channel.  */
    putchar(0);
  }

  {
    float in_val;

    /* `row_buffer' is used so that we can shift longitude zero to be
       at the center of the image.  */
#define ROWB_SIZE WIDTH * (BPP >> 3)
    unsigned char row_buffer[ROWB_SIZE];
    unsigned int col_start = (WIDTH / 2) * (BPP >> 3);
    unsigned int col_pos = col_start;

    while (scanf("%f", &in_val) != EOF) {
      unsigned int out_val;
      unsigned int bad, bbd, overflow, chs, ics;
      unsigned char blue, green, red;

      /* The two most important user parameters.  The sum of these
	 parameters must not exceed 24.  */
      bad = BITS_AFT_DEC; /* Bits After Decimal.  18 for max detail
			     (and worst JPEG compression due to high
			     noise), 7 preferred for high detail.  */
      bbd = BITS_BEF_DEC; /* Bits Before Decimal */

      /* Shift the desired number of bits after the decimal to be
	 before the decimal.  */
      out_val = (unsigned int)(in_val * (1 << bad));

      overflow = 2;
      if (overflow == 2) {
	/* Saturating Overflow: Any numbers greater than the maximum or
	   less than the minimum are truncated to the numeric
	   limits.  */
	int tout_val = out_val;
	int max = (1 << (bbd - 1 + bad)) - 1;
	int min = -max; /* Reserve the largest negative for NaN.  */

	/* 24 must be added to evade JPEG noise problems at the
	   minimum.  */
	min += 24;
	/* As a compensatory measure, the value range will be shifted
	   up by 12.  */
	out_val += 12; tout_val = out_val;

	if (tout_val > max) out_val = (unsigned int)max;
	if (tout_val < min) out_val = (unsigned int)min;
      }

      if (overflow != 2) {
	/* The largest negative is reserved for NaN.  In order to
	   avoid JPEG noise problems, shift the entire value range up
	   by 12.  */
	/* out_val += 12; */
      }

      /* Shift value zero to be at the middle of the unsigned value
	 range.  */
      out_val += 1 << (bbd - 1 + bad);

      if (overflow == 1) {
	/* BounceBack Wrap Overflow: If the first overflow bit is set,
	 make the rest of the number wrap from the unsigned max
	 downward to zero rather than wrap directly to unsigned
	 zero.  */
	if (out_val & (1 << (bbd + bad)))
	  out_val = ~out_val;
      } /* else Snap-Wrap Overflow as default.  */

      /* Mask out any bits that are too far in front of the
	 decimal.  */
      out_val &= ~(~0 << (bbd + bad));

      /* Set `out_val' to all zeros for NaN.  */
      if (in_val != in_val)
	out_val = 0;

      /* CHannel Shift: Use this if the data doesn't require all three
	 channels and you don't want it to appear in the green or blue
	 channels.  This can result in greater detail appearing in the
	 JPEG image.  (JPEG assumes that pure blue will appear dimmer
	 and hence require less luminance detail.)  */
      chs = 1;
      /* Option I: Shift so that the most significant bit is the first
	 bit of the red channel.  */
      if (chs == 1 && bbd + bad <= 24)
	chs = 24 - (bbd + bad);
      /* Option II: Only shift right far enough to exclude the range
	 of the blue channel, if possible.  */
      else if (chs == 2 && bbd + bad <= 16)
	chs = 8;
      else
	chs = 0;
      out_val <<= chs;

      /* Prepare to write out the three least significant bytes such
	 that the most significant byte is in the red channel.  */
      blue = out_val & 0xff;
      green = (out_val >> 8) & 0xff;
      red = (out_val >> 16) & 0xff;

      /* Bit Split: Only use upper 4 most significant bits per
	 channel.  Only works with 12-bit fixed point formats.  Not
	 recommended.  */
      /* if (bbd + bad == 12 && chs == 12) {
	blue = green & 0xf0;
	green = (red & 0x0f) << 4;
	red &= 0xf0;
	chs = 0;
      } */

      /* BounceBack Wrap: If the bit before a byte is 1, make the byte
	 wrap from 255 downward to zero rather than wrap directly to
	 zero for visual smoothness (better JPEG compression).  */
      if (chs < 8 && green & 0x01)
	blue = ~blue;
      if (chs < 16 && red & 0x01)
	green = ~green;

      /* Internal Channel Shift: If not all the bits in a channel are
	 used, shift the partial bits of a channel to be the most
	 significant bits.  This possibly makes sure that the JPEG
	 compression algorithm will give these bits a fair amount of
	 detail.  */
      ics = bbd + bad + chs;
      /* ics = 24; */ /* Override the automatic choice */
      if (ics <= 8) {
	ics = 8 - ics;
	blue <<= ics;
      } else if (ics <= 16) {
	ics = 16 - ics;
	green <<= ics;
      } else if (ics <= 24) {
	ics = 24 - ics;
	red <<= ics;
      } else
	ics = 0;

      /* Write the actual pixel value.  */
      if (bbd + bad <= 8) {
	/* Write out a grayscale image.  */
	green = (out_val >> chs) << ics;
	row_buffer[col_pos++] = green;
	row_buffer[col_pos++] = green;
	row_buffer[col_pos++] = green;
	col_pos %= ROWB_SIZE;
      } else {
	row_buffer[col_pos++] = blue;
	row_buffer[col_pos++] = green;
	row_buffer[col_pos++] = red;
	col_pos %= ROWB_SIZE;
      }
      if (col_pos == col_start)
	fwrite(&row_buffer, ROWB_SIZE, 1, stdout);

      getchar(); /* Ignore the delimeter that follows.  */
    }
  }

  return 0;
}
