/* Convert a JSON tracks file to the format that is optimized for the
   web viewer.

Copyright (C) 2014 University of Minnesota

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/

/* Usage: tracksconv TYPE <INPUT >OUTPUT

   TYPE is 0 for a cyclonic tracks JSON and 1 for an acyclonic tracks JSON.

   Input data format: [ list of tracks ]
   track: [ list of eddies ]
   eddy: [ latitude, longitude, date_index, eddy_index ]
   Date indexes start from one, not zero.

   Latitudes must be clamped within the range [ -90, 90 ], and
   longitudes must be clamped within the range [ -180, 180 ].  */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>
#include <ctype.h>
#include <errno.h>

#include "xmalloc.h"
#include "exparray.h"
#include "qsorts.h"

#ifndef __cplusplus
enum bool_tag { false, true };
typedef enum bool_tag bool;
#endif

struct InputEddy_tag {
  float lat; /* Latitude */
  float lon; /* Longitude */
  unsigned date_index;
  unsigned eddy_index;
};
typedef struct InputEddy_tag InputEddy;

typedef struct SortedEddy_tag SortedEddy;
struct SortedEddy_tag {
  unsigned type;
  unsigned coords[2]; /* Latitude (0) and longitude (1) */
  unsigned date_index;
  unsigned eddy_index;
  /* unsigned unsorted_index; */
  /* Pointer of the next eddy in a track.  If there is no next eddy,
     then this points to the current eddy itself.  NULL is used when
     an eddy points to itself.  */
  SortedEddy *next;
  SortedEddy *prev;
};

EA_TYPE(SortedEddy);
EA_TYPE(unsigned);
EA_TYPE(wchar_t);

/* Whether or not to use UTF-16 codepoints above 0xd7ff for encoding
   integers.  Note that using codepoints 0xe000 to 0xffff requires
   more effort on the side of the decoder, or is slower, in other
   words.  */
bool max_utf_range = false;
bool tracks_keyed = false;
bool pad_newlines = true;
unsigned tot_num_tracks;
unsigned max_track_len;
SortedEddy_array sorted_eddies;
unsigned_array date_chunk_starts;
/* Maximum number of eddies on a single date index.  */
unsigned max_frame_eddies;

/* [0] "Relative dimension 0"
   [1] "Relative dimension 1"
   [2] Temporary copy of relative dimension 0.

   "Relative dimension 0" cycles between latitude and longitude,
   depending on the current kd-tree construction iteration.  */
#define KD_DIMS 2
SortedEddy *kd_reldim[KD_DIMS+1];

void display_help(FILE *fout, const char *progname);
bool put_short_in_range(FILE *fout, unsigned value);
int parse_json(FILE *fp, unsigned eddy_type);
int add_eddy(InputEddy *ieddy, unsigned eddy_type,
	     bool start_of_track);
int qs_date_cmp(const void *p1, const void *p2, void *arg);
int qs_lat_cmp(const void *p1, const void *p2);
int qs_lon_cmp(const void *p1, const void *p2);
void qs_eddy_swap(void *p1, void *p2, void *arg);
void kd_eddy_move(SortedEddy *dest, SortedEddy *src);
int kd_tree_build(unsigned begin_start, unsigned begin_length);

void display_help(FILE *fout, const char *progname) {
    fprintf(fout, "Usage: %s [OPTIONS] [-o OUTPUT]\n"
	    "    [TYPE file TYPE file ...] [TYPE TYPE ... <INPUT] [>OUTPUT]\n",
	    progname);
    fprintf(fout, "TYPE is 0 for an anticyclonic tracks JSON and 1 "
	    "for a cyclonic tracks JSON.\n\n");
    fputs(
"Options:\n"
"  -v    Output computational diagnostics.\n"
"  -vv diag-file    Output data diagnostics to the given file.\n"
"  -x    Enable extended output range (0x0000 to 0xf7fe).\n"
"  -nk   Disable kd-tree construction.\n"
"  -np   Disable padding the output data with newlines.\n"
"  -u    Write the contents of the given text file into the header of\n"
"        the output data.  The text file must be encoded as UTF-16 little\n"
"        endian with BOM.\n"
"  -o OUTPUT    Send output to a named file (standard output by default).\n",
          fout);
}

int main(int argc, char *argv[]) {
  int retval = 0;
  bool diag_proc = false; /* Show processing diagnostics?  */
  bool build_kd = true;
  FILE *fdiag = NULL;
  FILE *fout = stdout;
  FILE *fuser = NULL;
  wchar_t_array user_info;

  if (argc < 2) {
    display_help(stderr, argv[0]);
    return 1;
  } else if (!strcmp(argv[1], "-h") || !strcmp(argv[1], "--help")) {
    display_help(stdout, argv[0]);
    return 0;
  }

  argv++;

#define FOPEN_ARGV_OR_ERROR(fp, mode) \
  do { \
    char *filename = *++argv; \
    fp = fopen(filename, mode); \
    if (fp == NULL) { \
      fprintf(stderr, "Error: Could not open %s: %s\n", \
	      filename, strerror(errno)); \
      return 1; \
    } \
  } while(0)

  while (*argv != NULL && (*argv)[0] == '-') {
    if (!strcmp(*argv, "-v"))
      diag_proc = true;
    else if (!strcmp(*argv, "-vv"))
      FOPEN_ARGV_OR_ERROR(fdiag, "wt");
    else if (!strcmp(*argv, "-x"))
      max_utf_range = true;
    else if (!strcmp(*argv, "-o"))
      FOPEN_ARGV_OR_ERROR(fout, "wb");
    else if (!strcmp(*argv, "-nk"))
      build_kd = false;
    else if (!strcmp(*argv, "-np"))
      pad_newlines = false;
    else if (!strcmp(*argv, "-u"))
      FOPEN_ARGV_OR_ERROR(fuser, "rb");
    else
      break;
    argv++;
  }

  if (*argv == NULL) {
    fputs("Error: Invalid command line.\n", stderr);
    return 1;
  }

  if (fuser != NULL) {
    /* Read and sanity check the user header info.  */
    const wchar_t *header_endsig = L"\n# BEGIN_DATA\n";
    int c;

    /* Check for the correct BOM.  */
    if (getc(fuser) != 0xff || getc(fuser) != 0xfe) {
      fputs("Error: User header text file must be encoded "
	    "as UTF-16 little endian with BOM.\n", stderr);
      return 1;
    }

#define GET_SHORT(value) \
    c = getc(fuser); (value) = c & 0xff; \
    c = getc(fuser); (value) = (value) | ((c & 0xff) << 8)

    EA_INIT(wchar_t, user_info, 16);
    while (true) {
      wchar_t wc;
      GET_SHORT(wc);
      if (c == EOF) break;
      /* Check for null characters during read.  */
      if (wc == 0) {
	fputs("Error: User header text file must not contain "
	      "null characters.\n", stderr);
	EA_DESTROY(user_info); return 1;
      }
      EA_APPEND(user_info, wc);
    }
    EA_APPEND(user_info, 0);
    fclose(fuser); fuser = NULL;

    /* Verify that the header end signature does not appear in the
       user data.  */
    if (wcsstr(user_info.d, header_endsig) != NULL) {
      fputs(
"Error: \"# BEGIN_DATA\" was found in the user header text file.\n"
"You must not use this text as the only text on a line.\n",
	    stderr);
      EA_DESTROY(user_info); return 1;
    }
  } else
    { user_info.d = NULL; user_info.len = 0; }

  /* Error handling in regard to the command-line UI is finished.
     Perform heavyweight startup procedures.  */
  tot_num_tracks = 0;
  max_track_len = 0;
  EA_INIT(SortedEddy, sorted_eddies, 1048576);
  EA_INIT(unsigned, date_chunk_starts, 16);
  max_frame_eddies = 0;

  if (diag_proc)
    fprintf(stderr, "Parsing input...\n");

  /* Start by reading all of the input data into a data structure in
     memory.  */
  while (*argv != NULL) {
    char *filename;
    FILE *fp;
    int parse_status;

    unsigned eddy_type = strtoul(*argv++, NULL, 0);
    if (eddy_type > 1) {
      fputs("Error: Invalid eddy type specified.\n", stderr);
      retval = 1; goto cleanup;
    }

    if (*argv == NULL || !strcmp(*argv, "0") || !strcmp(*argv, "1")) {
      /* Read from standard input.  */
      if (parse_json(stdin, eddy_type) != 0)
	{ retval = 1; goto cleanup; }
      continue;
    }

    filename = *argv++;
    fp = fopen(filename, "rt");
    if (fp == NULL) {
      fprintf(stderr, "Error: Could not open %s: %s\n",
	      filename, strerror(errno));
      retval = 1; goto cleanup;
    }

    parse_status = parse_json(fp, eddy_type); fclose(fp);
    if (parse_status != 0)
      { retval = 1; goto cleanup; }
  }

  { /* Now that array construction is finished, the `next' and `prev'
       pointers can be rebased to the actual base address.  */
    unsigned i;
    for (i = 0; i < sorted_eddies.len; i++) {
      unsigned next_idx = sorted_eddies.d[i].next - (SortedEddy*)0;
      unsigned prev_idx = sorted_eddies.d[i].prev - (SortedEddy*)0;
      if (next_idx == i) sorted_eddies.d[i].next = NULL;
      else sorted_eddies.d[i].next = sorted_eddies.d + next_idx;
      if (prev_idx == i) sorted_eddies.d[i].prev = NULL;
      else sorted_eddies.d[i].prev = sorted_eddies.d + prev_idx;
    }
  }

  if (diag_proc) {
    fprintf(stderr, "Done parsing: %u tracks, %u max. track length, "
	    "%u total eddies.\n",
	    tot_num_tracks, max_track_len, sorted_eddies.len);
    fprintf(stderr, "Sorting eddies by date...\n");
  }

  /* Sort the eddies by date.  We must use our own sort function
     instead of the libc `qsort()' so that the linked lists of eddies
     are preserved.  (Actually, it's just a trivially modified copy of
     the GNU C Library's `qsort()'.)  */
  qsorts_r(sorted_eddies.d, sorted_eddies.len, sizeof(SortedEddy),
	   qs_date_cmp, qs_eddy_swap, NULL);

  if (diag_proc)
    fprintf(stderr, "Building date index list...\n");

  { /* The eddies are now grouped into series of contiguous chunks
       where each date index in the chunk is identical.  Find the
       indexes that correspond to the start of each such chunk.  */
    unsigned i;
    /* NOTE: Since the first date index should be one, setting
       `last_date_index' to zero will guarantee that the first
       iteration adds a chunk start index.  */
    unsigned last_date_index = 0;
    unsigned last_chunk_start = 0;
    if (sorted_eddies.d[0].date_index == 0) {
      fputs("Error: Date indexes must not equal zero.\n", stderr);
      EA_APPEND(date_chunk_starts, 0);
      retval = 1; /* goto cleanup; */
    }
    for (i = 0; i < sorted_eddies.len; i++) {
      unsigned date_index_diff =
	sorted_eddies.d[i].date_index - last_date_index;
      if (date_index_diff == 1) {
	unsigned num_eddies = i - last_chunk_start;
	EA_APPEND(date_chunk_starts, i);
	if (num_eddies > max_frame_eddies)
	  max_frame_eddies = num_eddies;
	last_date_index = sorted_eddies.d[i].date_index;
	last_chunk_start = i;
      } else if (date_index_diff != 0) {
	fputs("Error: Every date index must be occupied by eddies.\n", stderr);
	fprintf(stderr, "The eddies skip from date index %u to %u.\n",
		last_date_index, sorted_eddies.d[i].date_index);
	retval = 1; /* goto cleanup; */
      }
    }
    /* For convenience, append one last entry equal to the total
       number of eddies.  */
    EA_APPEND(date_chunk_starts, i);
  }

  if (diag_proc)
    fprintf(stderr, "Done: %u date indexes.\n", date_chunk_starts.len - 1);

  if (build_kd) {
    /* Build kd-trees for each date index.  */
    unsigned i;

    if (diag_proc)
      fprintf(stderr, "Building kd-trees...\n");

#define CLEANUP_KD_RELDIM() \
    for (i = 0; i < KD_DIMS + 1; i++) xfree(kd_reldim[i])

    for (i = 0; i < KD_DIMS + 1; i++)
      kd_reldim[i] = (SortedEddy*)xmalloc(sizeof(SortedEddy) *
					  max_frame_eddies);

    for (i = 0; i < date_chunk_starts.len - 1; i++) {
      SortedEddy *start = sorted_eddies.d + date_chunk_starts.d[i];
      unsigned length = date_chunk_starts.d[i+1] - date_chunk_starts.d[i];

      /* Sort the eddies by latitude and longitude.  */
      memcpy(kd_reldim[0], start, sizeof(SortedEddy) * length);
      qsort(kd_reldim[0], length, sizeof(SortedEddy), qs_lat_cmp);
      memcpy(kd_reldim[1], start, sizeof(SortedEddy) * length);
      qsort(kd_reldim[1], length, sizeof(SortedEddy), qs_lon_cmp);

      /* Build the actual kd-tree for this date range.  */
      if (kd_tree_build(0, length) != 0)
	{ CLEANUP_KD_RELDIM(); retval = 1; goto cleanup; }

      { /* Copy the finished kd-tree back to the official location
	   within `sorted_eddies', rebasing the pointers as
	   necessary.  */
	unsigned j;
	for (j = 0; j < length; j++)
	  kd_eddy_move(start + j, &kd_reldim[0][j]);
      }
    }
    CLEANUP_KD_RELDIM();
  }

  if (diag_proc)
    fprintf(stderr, "Writing output...\n");

  { /* Output the new JSON data as UTF-16 characters.  Each character
       will be treated as an unsigned integer on input.  (Additional
       decoding is applied for fixed-point numbers and bit-packed
       fields.)  Newlines are written out at regular intervals for
       safety.  Null characters must never be stored in the output
       stream.  */
    unsigned i = 0;

    /* Little endian will be used for this encoding.  */
#define PUT_SHORT(value) \
    putc((value) & 0xff, fout); \
    putc(((value) >> 8) & 0xff, fout)
#define ERROR_OR_PUT_SHORT(value, errmsg) \
    if (!put_short_in_range(fout, (unsigned)value)) { \
      fprintf(stderr, errmsg, i, value); \
      retval = 1; /* goto cleanup; */ \
    }

    PUT_SHORT(0xfeff); /* BOM (Byte Order Mask) */

    { /* Start by writing a human-friendly information message that also
	 serves as a file type.  */
      const char *header_start =
"# Binary eddy tracks data for the Ocean Eddies Web Viewer.\n"
"# For more information on this file format, see the following webpage:\n"
"# <http://example.com/dev_url>\n";
      const char *header_end = "#\n# BEGIN_DATA\n";

      const char *cur_pos = header_start;
      while (*cur_pos != '\0')
	{ PUT_SHORT(*cur_pos); cur_pos++; }

      if (user_info.len > 0) {
	/* Write out additional user header information into this
	   area.  */
	unsigned j;
	const char *spacer = "#\n";
	cur_pos = spacer;
	while (*cur_pos != '\0')
	  { PUT_SHORT(*cur_pos); cur_pos++; }
	for (j = 0; j < user_info.len - 1; j++)
	  { PUT_SHORT(user_info.d[j]); }
	EA_DESTROY(user_info);
      }

      cur_pos = header_end;
      while (*cur_pos != '\0')
	{ PUT_SHORT(*cur_pos); cur_pos++; }
    }

    { /* Write the format header.  */
      unsigned short format_bits = 0x01;
      if (max_utf_range)
	format_bits |= 0x02;
      if (tracks_keyed)
	format_bits |= 0x04;
      if (pad_newlines)
	format_bits |= 0x08;
      PUT_SHORT(format_bits);
    }

    /* Convert the date chunk start indexes structure to an eddies per
       date index structure, and output that structure.  */
    ERROR_OR_PUT_SHORT(date_chunk_starts.len - 1,
		       "Error: i = %u: Too many date indexes: %u\n");
    if (pad_newlines) { PUT_SHORT('\n'); }
    for (i = 1; i < date_chunk_starts.len; i++) {
      unsigned num_eddies = date_chunk_starts.d[i] - date_chunk_starts.d[i-1];
      ERROR_OR_PUT_SHORT(num_eddies,
		 "Error: i = %u: Too many eddies on a date index: %u.\n");
      if (pad_newlines && i % 32 == 0)
	{ PUT_SHORT('\n'); }
    }

    /* Output the optimized eddy entries.  `next' and `prev' pointers
       are converted to indexes relative to the current index.  */
    for (i = 0; i < sorted_eddies.len; i++) {
      SortedEddy *seddy = &sorted_eddies.d[i];
      unsigned int_lat = seddy->coords[0];
      unsigned int_lon = seddy->coords[1];
      unsigned rel_next = (seddy->next == NULL) ? 0 :
	((seddy->next - sorted_eddies.d) - i);
      unsigned rel_prev = (seddy->prev == NULL) ? 0 :
	(i - (seddy->prev - sorted_eddies.d));

      if (seddy->eddy_index == 0) {
	fprintf(stderr,
		"Error: i = %u: Eddy indexes must never equal zero.\n", i);
	retval = 1; /* goto cleanup; */
      }

      /* Since latitudes only range from -90 to 90, the encoding
	 method (located in the `add_eddy()' function) for latitude
	 only needs 14 bits.  This leaves room for storing one extra
	 bit of information in the same character.  */
      /* The type information, which is only a zero or a one, can be
	 stored in the latitude field.  */
      int_lat |= seddy->type << 14;

      if (pad_newlines && i % 32 == 0)
	{ PUT_SHORT('\n'); }

      PUT_SHORT(int_lat);
      PUT_SHORT(int_lon);
      /* Eddy ID is only of relevance to the MATLAB viewer.  No future
	 data or encoding mechanism in the web viewer will ever have a
	 justified need for an Eddy ID: kd-trees and image storage
	 formats render it redundant.

      ERROR_OR_PUT_SHORT(seddy->eddy_index,
			 "Error: i = %u: Eddy index too large: %u\n"); */
      /* NOTE: Some errors may cause the next or previous eddy offsets
	 to be negative, so we use %d instead of %u for diagnostic
	 convenience.  */
      ERROR_OR_PUT_SHORT(rel_next,
			 "Error: i = %u: Next eddy offset too large: %d\n");
      ERROR_OR_PUT_SHORT(rel_prev,
		 "Error: i = %u: Previous eddy offset too large: %d\n");

      if (fdiag != NULL) {
	float latitude = (float)((int)(seddy->coords[0] -
				       (1 << 13))) / (1 << 6);
	float longitude = (float)((int)(seddy->coords[1] -
					(1 << 14))) / (1 << 6);
	unsigned next_idx = (seddy->next == NULL) ? i :
	  (seddy->next - sorted_eddies.d);
	unsigned prev_idx = (seddy->prev == NULL) ? i :
	  (seddy->prev - sorted_eddies.d);
	fprintf(fdiag,
		"i = %-5u            Type: %-5u\n"
		"Latitude: %-7.2f    Longitude: %-7.2f\n"
		"Date index: %-5u    Eddy index: %-5u\n"
		"Next index: %-5u    Previous index: %-5u\n\n",
		i, seddy->type,
		latitude, longitude,
		seddy->date_index, seddy->eddy_index,
		next_idx, prev_idx);
      }
    }

    /* Put a newline at the end of the data for good measure.  */
    if (pad_newlines) { PUT_SHORT('\n'); }
  }

  /* retval = 0; */
 cleanup:
  EA_DESTROY(sorted_eddies);
  EA_DESTROY(date_chunk_starts);
  if (fdiag != NULL && fclose(fdiag) == EOF) {
    fprintf(stderr, "Error closing diagnostics file: %s\n", strerror(errno));
    retval = 1;
  }
  if (fclose(fout) == EOF) {
    fprintf(stderr, "Error closing output file: %s\n", strerror(errno));
    retval = 1;
  }
  return retval;
}

/* Write a UTF-16 character, but only if the value is within the valid
   range for unsigned integer encoding.  Returns `true' on success,
   `false' on failure.  */
bool put_short_in_range(FILE *fout, unsigned value) {
  unsigned max = 0xd7fe;
  if (max_utf_range)
    max = 0xf7fe;
  if (value > max)
    return false;
  if (value == 0)
    value = max + 1;
  if (value > 0xd7ff)
    value += 0x0800;
  PUT_SHORT(value);
  return true;
}

/* Parse a JSON file from the given file pointer and append its
   contents to the input data structure.  Returns zero on success, one
   on failure.  */
int parse_json(FILE *fp, unsigned eddy_type) {
  int c;
  int nest_level = 0;
  bool start_of_track = false;
  unsigned track_len = 0, last_date_idx;
  /* nest_level == 1: Top-level tracks array
     nest_level == 2: Eddies array within one track
     nest_level == 3: Parameters of one eddy */
  unsigned eddy_param_index = 0;
  InputEddy cur_eddy;

  while (isspace(c = getc(fp)));
  ungetc(c, fp);

  if ((c = getc(fp)) != '[') {
    if (c == EOF)
      fputs("Error: Unexpected end of input.\n", stderr);
    else
      fprintf(stderr,
	      "Error: Bad character at start of input: %c\n", c);
    return 1;
  }
  nest_level++;
  while (nest_level > 0) {

#define FSCANF_OR_ERROR(format, param) \
    c = fscanf(fp, format, param); \
    if (c == EOF) { \
      fputs("Error: Unexpected end of input.\n", stderr); \
      return 1; \
    } else if (c != 1) { \
      fputs("Error: An expected input parameter could not be " \
	    "read during parsing.\n", stderr); \
      return 1; \
    }

    if (nest_level == 3) {
      while (isspace(c = getc(fp)));
      ungetc(c, fp);
      switch (eddy_param_index++) {
      case 0: FSCANF_OR_ERROR("%f", &cur_eddy.lat); break;
      case 1: FSCANF_OR_ERROR("%f", &cur_eddy.lon); break;
      case 2: FSCANF_OR_ERROR("%u", &cur_eddy.date_index); break;
      case 3: FSCANF_OR_ERROR("%u", &cur_eddy.eddy_index); break;
      }
    }

    while (isspace(c = getc(fp)));
    switch (c) {
    case ',':
      /* Just skip the separator.  */
      break;
    case '[':
      nest_level++;
      if (nest_level == 2) {
	tot_num_tracks++;
	start_of_track = true;
	track_len = 0;
      } else if (nest_level == 3)
	eddy_param_index = 0;
      break;
    case ']':
      if (nest_level == 3) {
	if (eddy_param_index < 4) {
	  fprintf(stderr,
		  "Error: In track %u: Not enough parameters in an eddy.\n",
		  tot_num_tracks - 1);
	  return 1;
	}
	if (!start_of_track && cur_eddy.date_index - last_date_idx != 1) {
	  fprintf(stderr,
	"Error: In track %u: All date indexes in a track must strictly be\n"
	"increasing consecutive integers.  The viewer uses this assumption\n"
	"to optimize filtering tracks by length.\n",
		  tot_num_tracks - 1);
	  return 1;
	}
	if (add_eddy(&cur_eddy, eddy_type, start_of_track) != 0)
	  return 1;
	start_of_track = false;
	track_len++;
	last_date_idx = cur_eddy.date_index;
      } else if (nest_level == 2) {
	if (track_len > max_track_len)
	  max_track_len = track_len;
      }
      nest_level--;
      break;
    case EOF:
      fputs("Error: Unexpected end of input.\n", stderr);
      return 1;
    default:
      fprintf(stderr,
	      "Error: Unexpected character found in input: %c\n", c);
      return 1;
    }
  }
  return 0;
}

/* Add an eddy to the eddy-indexed array.  Returns zero on success,
   one on failure.  NOTE: Because the `sorted_eddies' array's base
   address is constantly changing during construction, the `next' and
   `prev' pointers use zero as their base address.  */
int add_eddy(InputEddy *ieddy, unsigned eddy_type, bool start_of_track) {
  SortedEddy *seddy = &sorted_eddies.d[sorted_eddies.len];
  seddy->type = eddy_type;

  /* Convert the floating point latitude and longitude to the destined
     output 14/15-bit fixed-point format immediately, for faster
     integer arithmetic during kd-tree construction.  (This conversion
     was previously performed just before output.)  */
  if (ieddy->lat < -90 || ieddy->lat > 90) {
    fprintf(stderr, "Error: Latitude out of range: %f\n",
	    ieddy->lat);
    return 1;
  }
  if (ieddy->lon < -180 || ieddy->lon > 180) {
    fprintf(stderr, "Error: Longitude out of range: %f\n",
	    ieddy->lon);
    return 1;
  }
  seddy->coords[0] = ((unsigned)(ieddy->lat * (1 << 6)) +
		      (1 << 13)) & 0x3fff;
  seddy->coords[1] = ((unsigned)(ieddy->lon * (1 << 6)) +
		      (1 << 14)) & 0x7fff;

  seddy->date_index = ieddy->date_index;
  seddy->eddy_index = ieddy->eddy_index;
  /* seddy->unsorted_index = sorted_eddies.len; */
  seddy->prev = (SortedEddy*)0 + sorted_eddies.len;
  if (!start_of_track)
    seddy->prev--;
  seddy->next = (SortedEddy*)0 + sorted_eddies.len;

  /* Initialize the `next' index of the previous eddy.  */
  if (!start_of_track)
    { seddy--; seddy->next++; }

  EA_ADD(sorted_eddies);
  return 0;
}

/* `qsorts_r()' date comparison function.  */
int qs_date_cmp(const void *p1, const void *p2, void *arg) {
  const SortedEddy *se1 = (const SortedEddy*)p1;
  const SortedEddy *se2 = (const SortedEddy*)p2;
  return (int)(se1->date_index - se2->date_index);
}

/* `qsort()' latitude comparison function.  */
int qs_lat_cmp(const void *p1, const void *p2) {
  const SortedEddy *se1 = (const SortedEddy*)p1;
  const SortedEddy *se2 = (const SortedEddy*)p2;
  return (int)(se1->coords[0] - se2->coords[0]);
}

/* `qsort()' longitude comparison function.  */
int qs_lon_cmp(const void *p1, const void *p2) {
  const SortedEddy *se1 = (const SortedEddy*)p1;
  const SortedEddy *se2 = (const SortedEddy*)p2;
  return (int)(se1->coords[1] - se2->coords[1]);
}

/* `qsorts_r()' swapping function that modifies list links as
   necessary.  */
void qs_eddy_swap(void *p1, void *p2, void *arg) {
  SortedEddy *se1 = (SortedEddy*)p1;
  SortedEddy *se2 = (SortedEddy*)p2;
  SortedEddy temp;

  /* First correct the list links.  */

  if (se1->next == se2) se1->next = se1;
  else if (se1->next != NULL) se1->next->prev = se2;

  if (se1->prev == se2) se1->prev = se1;
  else if (se1->prev != NULL) se1->prev->next = se2;

  if (se2->next == se1) se2->next = se2;
  else if (se2->next != NULL) se2->next->prev = se1;

  if (se2->prev == se1) se2->prev = se2;
  else if (se2->prev != NULL) se2->prev->next = se1;

  /* Then swap the memory quantities verbatim.  */
  memcpy(&temp, se1, sizeof(SortedEddy));
  memcpy(se1, se2, sizeof(SortedEddy));
  memcpy(se2, &temp, sizeof(SortedEddy));
}

/* Similar to the swap function above, this function handles
   rearranging the list links when an eddy gets moved (i.e. copied) to
   a new memory address.  */
void kd_eddy_move(SortedEddy *dest, SortedEddy *src) {
  if (src->next != NULL) src->next->prev = dest;
  if (src->prev != NULL) src->prev->next = dest;
  memcpy(dest, src, sizeof(SortedEddy));
}

/* NOTE: Thanks to the glibc `qsort()' function for providing a good
   example of how to implement the software stack of `kd_tree_build()'
   in an efficient way.  */

typedef struct {
  unsigned start;
  unsigned length;
  unsigned depth;
} kd_stack_node;

#define KD_PUSH(istart, ilength, idepth) \
  ((void) ((top->start = (istart)), (top->length = (ilength)), \
	   (top->depth = (idepth)), ++top))
#define	KD_POP(istart, ilength, idepth) \
  ((void) (--top, (istart = top->start), (ilength = top->length), \
	   (idepth = top->depth)))

/* This function builds a 2D kd-tree based off of the latitudes and
   longitudes of the given input eddies.  The input should have been
   presorted by each dimension into `kd_reldim'.  The finished kd-tree
   is stored in `kd_reldim[0]'.  You must copy `kd_reldim[0]' to a
   separate storage location using `kd_eddy_move()' for each
   SortedEddy for its list links to be useful.

   Parameters:

   begin_start -- First index in in each `kd_reldim' array to consider.
   begin_length -- Length of `kd_reldim' arrays to consider.

   Returns zero on sucess, one on failure.  */
int kd_tree_build(unsigned begin_start, unsigned begin_length) {
  /* Note: The algorithms used to preprocess the data before this
     algorithm ensure that the number of eddies on a certain date
     index never equals zero.  Thus, it is not necessary to check if
     (begin_length == 0).  */

  unsigned start = begin_start;
  unsigned length = begin_length;
  unsigned depth = 0;
  kd_stack_node stack[QS_STACK_SIZE];
  kd_stack_node *top = stack;

  /* Set the `length' on the bogus first stack entry to 3 to simplify
     the `KD_POP()' loop below.  */
  KD_PUSH(0, 3, 0);

  while (QS_STACK_NOT_EMPTY) {
    unsigned curdim; /* Current dimension (latitude (0) or longitude (1)) */
    unsigned median, end;
    unsigned median_val;
    unsigned eq_median;
    /* List of eddies equal to the median value that should belong in
       the "left" (less-than) partition.  */
#define MAX_EQM_EDDIES 16
    SortedEddy eqm_eddies[MAX_EQM_EDDIES]; unsigned eqm_eddies_len = 0;
    unsigned i, j;

    /* 1. Pick the median point at the current dimension.  */
    curdim = depth % 2;
    median = start + (length - 1) / 2; end = start + length;
    median_val = kd_reldim[0][median].coords[curdim];
    /* If there are other points equal to the median in this
       dimension, find the `>=' division boundary.  */
    eq_median = median;
    while (eq_median > start &&
	   kd_reldim[0][eq_median-1].coords[curdim] ==
	     median_val) {
      eq_median--;
      if (eqm_eddies_len > MAX_EQM_EDDIES) {
	fputs("Error: kd-tree construction failed:\n"
	      "Too many eddies have an identical coordinate.\n", stderr);
	return 1;
      }
      memcpy(&eqm_eddies[eqm_eddies_len++], &kd_reldim[0][eq_median],
	     sizeof(SortedEddy));
    }

    /* 2. Make a temporary copy of kd_reldim[0].  */
    memcpy(kd_reldim[KD_DIMS] + start, kd_reldim[0] + start,
	   sizeof(SortedEddy) * length);

    /* 3. Shift to the next current dimension by constructing the
       `reldim + 1' points in `reldim'.  Note that pointer rebasing
       can be delayed until the kd-tree construction is finished,
       since within a date index chunk, the pointers are either NULL
       (point to themselves) or point outside the current date index
       chunk.  */
    for (j = 0; j < KD_DIMS; j++) {
      /* End indexes (index just beyond last element) of
	 subarrays.  */
      unsigned left_subend = start, right_subend = median + 1;
      bool median_moved = false; unsigned eq_med_end = eq_median;
      for (i = start; i < end; i++) {
	int cmp = (int)(kd_reldim[j+1][i].coords[curdim] - median_val);
	if (cmp < 0) /* Left */
	  { memcpy(&kd_reldim[j][left_subend++], &kd_reldim[j+1][i],
		   sizeof(SortedEddy)); continue; }
	else if (!median_moved && cmp == 0 &&
		 !memcmp(&kd_reldim[j+1][i],
			 &kd_reldim[0][median],
			 sizeof(SortedEddy))) { /* Median */
	  memcpy(&kd_reldim[j][median], &kd_reldim[j+1][i],
		 sizeof(SortedEddy));
	  median_moved = true; continue;
	} else if (eq_med_end < median && cmp == 0) { /* Equal-to median */
	  bool move_okay = false;
	  /* We must be careful not to place elements in different
	     dimensional sort orders in different partitions.  */
	  unsigned k;
	  for (k = 0; k < eqm_eddies_len; k++) {
	      if (!memcmp(&eqm_eddies[k], &kd_reldim[j+1][i],
			  sizeof(SortedEddy)))
		{ move_okay = true; break; }
	  }
	  if (move_okay) {
	    memcpy(&kd_reldim[j][left_subend++], &kd_reldim[j+1][i],
		   sizeof(SortedEddy));
	    eq_med_end++; continue;
	  } /* else fall through */
	} /* else Right */
	memcpy(&kd_reldim[j][right_subend++], &kd_reldim[j+1][i],
	       sizeof(SortedEddy));
      }
      if (left_subend != median || eq_med_end != median ||
	  median_moved == false || right_subend != end) {
	fputs("Error: kd-tree construction failed: "
	      "internal inconsistency found.\n", stderr);
	return 1;
      }
    }

    { /* 4. Recurse on the left and right subarrays.  */
      unsigned left_len = median - start;
      unsigned right_len = end - (median + 1);
      depth++;
      if (left_len > right_len) {
	/* Push the larger left subarray.  */
	KD_PUSH(start, left_len, depth);
	start = median + 1; length = right_len;
      } else {
	/* Push the larger (or equal) right subarray.  */
	KD_PUSH(median + 1, right_len, depth);
	/* start = start; */ length = left_len;
      }

      /* Handle trivial cases immediately.  */
      while (length <= 1) {
	KD_POP(start, length, depth);
      }
    }
  }

  return 0;
}
