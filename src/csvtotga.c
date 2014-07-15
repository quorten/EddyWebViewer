/* Convert a CSV SSH data file to a TGA image file with the SSH values
   encoded into fixed point numbers, possibly with other bit
   transformations applied.

   Two notable large scale transformations:

   * Longitude zero is shifted from the left of the image to the
     center of the image.

   * The CSV data is ordered from latitude -90 to latitude 90, whereas
     the TGA is written out as a bottom-up TGA, effectively vertically
     reversing the SSH image.
*/

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <alloca.h>

int main(int argc, char *argv[]) {
  unsigned int width = 1440, height = 721, bpp = 24;
  unsigned int bbd, bad, overflow, chanflow, noise_margin = 0;

  /* The two most important user parameters.  */
  bbd = 8; /* Bits Before Decimal */
  bad = 7; /* Bits After Decimal.  18 for max detail (and worst JPEG
	      compression due to high noise), 7 preferred for high
	      detail.  */

  { /* Check if the command line is valid.  */
    int help = 0;
    if (argc == 2 && (!strcmp(argv[1], "-h") || !strcmp(argv[1], "--help")))
      help = 1;
    if (argc > 4)
      help = -1;
    if (help == 1) {
      printf("Usage: %s [WxHxD] [B.A] [OPTIONS] <INPUT.dat >OUTPUT.tga\n\n",
	     argv[0]);
      puts(
"`[]' delimits optional parameters.  Capital letters represent the\n"
"parameters described below:\n"
"\n"
"    W    Width of the input data (default 1440)\n"
"    H    Height of the input data (default 721)\n"
"    D    Bits per pixel of the output image (default 24)\n"
"    B    Bits before decimal to store for each output SSH sample (default 8)\n"
"    A    Bits after decimal to store for each output SSH sample (default 7)\n"
"\n"
"Options:\n"
"  -mM    Noise margin to add to minimum SSH value.  Used to evade\n"
"         JPEG noise problems when encoding NaN as absolute zero.\n"
"\n"
"Input data must be in equirectangular projection, sea surface height\n"
"measured in centimeters.  There should be no space characters\n"
"before or after the commas in the CSV, newlines should be\n"
"Unix-style, and there should be one newline character at the end of\n"
"last row in the file.");
      return 0;
    } else if (help == -1) {
      fprintf(stderr,
	      "%s: Invalid command line.\n"
	      "Type `%s --help' for command line usage.\n",
	      argv[0], argv[0]);
      return 1;
    }
  }

  /* Additional options:

    -os -obbw -osw

    -cbbw -csw

    -r7-0:23-16 -g7-0:15-8 -b7-0:7-0
  */

  { /* Parse the command line arguments.  */
    /* Variables that keep track of which segments were specified.  */
    int dims_spec = 0, bits_spec = 0;
    char *prog_name = *argv++;
    while (--argc > 0) {
      if ((*argv)[0] == '-') {
  	switch ((*argv)[1]) {
  	case 'm': noise_margin = atoi(*argv + 2); break;

	case 'o':
	  if (!strcmp(*argv + 2, "s"))
	    overflow = 2;
	  else if (!strcmp(*argv + 2, "bbw"))
	    overflow = 1;
	  else if (!strcmp(*argv + 2, "sw"))
	    overflow = 0;
	  else
	    goto invalid_option;
	  break;

	case 'c':
	  else if (!strcmp(*argv + 2, "bbw"))
	    chanflow = 1;
	  else if (!strcmp(*argv + 2, "sw"))
	    chanflow = 0;
	  else
	    goto invalid_option;
	  break;

  	default: invalid_option:
  	  fprintf(stderr, "%s: Error: Invalid option: %s\n",
  		  prog_name, *argv);
  	  return 1;
  	}
      }

      else if (strchr(*argv, 'x') != NULL) {
  	char *str_width = *argv;
  	char *str_height = strchr(*argv, 'x') + 1;
  	char *str_bpp = strchr(str_height, 'x');

  	if (dims_spec) {
  	  fprintf(stderr,
  		  "%s: Error: Multiple dimension specifications found.\n",
  		  prog_name);
  	  return 1;
  	}
  	dims_spec = 1;

  	*(str_height - 1) = '\0';
  	width = atoi(str_width);

  	if (str_bpp != NULL) {
  	  *str_bpp++ = '\0';
  	  bpp = atoi(str_bpp);
  	}

  	height = atoi(str_height);

      } else if (strchr(*argv, '.') != NULL) {
  	char *str_bbd = *argv;
  	char *str_bad = strchr(*argv, '.');

  	if (bits_spec) {
  	  fprintf(stderr,
  		  "%s: Error: Multiple precision specifications found.\n",
  		  prog_name);
  	  return 1;
  	}
  	bits_spec = 1;

  	*str_bad++ = '\0';
  	bbd = atoi(str_bbd);
  	bad = atoi(str_bad);
      }

      argv++;
    }

    if (bbd + bad > bpp) {
      fprintf(stderr,
"%s: Error: The requested number of bits before and after decimal\n"
"exceeds the bit depth.\n",
	      prog_name);
      return 1;
    }

    if (bpp != 8 && bpp != 24) {
      fprintf(stderr, "%s: Error: Unsupported bit depth.\n", prog_name);
      return 1;
    }

    if (bbd + bad <= 8)
      bpp = 8;
  }

  /* Write the TGA header.  */
  putchar(0); /* ID length */
  putchar(0); /* Color map type (none) */
  putchar(2); /* Image type (True Color) */

  /* No color map specification.  */
  putchar(0); putchar(0); putchar(0); putchar(0); putchar(0);

  { /* Image specification.  16-bit integers are stored in little
       endian in the TGA header.  */
    uint16_t xorg = 0, yorg = 0;
#define PUT_SHORT(var) putchar(var & 0xff); putchar((var >> 8) & 0xff)
    PUT_SHORT(xorg);  PUT_SHORT(yorg);
    PUT_SHORT(width); PUT_SHORT(height);
    putchar(bpp);
    /* Image descriptor.  When this is just set to zero the first row
       of pixels start at the bottom of the TGA and continue upward.
       Add 32 for top-down TGA.
       Add 8 if there is an 8-bit alpha channel.  */
    putchar(0);
  }

  { /* Convert the data.  */
    float in_val;

    /* `row_buffer' is used so that we can shift longitude zero to be
       at the center of the image.  */
    unsigned int rowb_size = width * (bpp >> 3);
    unsigned char *row_buffer = (unsigned char*)alloca(rowb_size);
    unsigned int col_start = (width / 2) * (bpp >> 3);
    unsigned int col_pos = col_start;

    while (scanf("%f", &in_val) != EOF) {
      unsigned int out_val;
      unsigned int overflow, chs, ics;
      unsigned char blue, green, red;

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

	/* The largest negative is reserved for NaN.  In order to
	   avoid JPEG noise problems, move the minimum upward by the
	   noise margin (if any).  */
	/* NOTE: noise_margin is assumed to be only useful for 8-bit
	   grayscale JPEG images that use saturating overflow.  */
	min += noise_margin;
	/* As a compensatory measure to make sure the range reduction
	   in both the maximum and minimum values are equal, the
	   stored value will be shifted up by half of the noise
	   margin.  */
	out_val += noise_margin / 2; tout_val = out_val;

	if (tout_val > max) out_val = (unsigned int)max;
	if (tout_val < min) out_val = (unsigned int)min;
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

      if (chanflow == 1) {
	/* BounceBack Wrap: If the bit before a byte is 1, make the
	   byte wrap from 255 downward to zero rather than wrap
	   directly to zero for visual smoothness (better JPEG
	   compression).  */
	if (chs < 8 && green & 0x01)
	  blue = ~blue;
	if (chs < 16 && red & 0x01)
	  green = ~green;
      }

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
      if (bpp == 8) {
	row_buffer[col_pos++] = (out_val >> chs) << ics;
	col_pos %= rowb_size;
      } else {
	row_buffer[col_pos++] = blue;
	row_buffer[col_pos++] = green;
	row_buffer[col_pos++] = red;
	col_pos %= rowb_size;
      }
      if (col_pos == col_start)
	fwrite(row_buffer, rowb_size, 1, stdout);

      getchar(); /* Ignore the delimeter that follows.  */
    }
  }

  return 0;
}
