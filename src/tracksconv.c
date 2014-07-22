/* Convert a JSON tracks file to the format that is optimized for the
   web viewer.

   Usage: tracksconv TYPE <INPUT >OUTPUT

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
#include <ctype.h>
#include <errno.h>

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
  float coords[2]; /* Latitude and longitude */
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

/* Whether or not to use UTF-16 codepoints above 0xd7ff for encoding
   integers.  Note that using codepoints 0xe000 to 0xffff requires
   more effort on the side of the decoder, or is slower, in other
   words.  */
bool max_utf_range = false;
unsigned tot_num_tracks;
SortedEddy_array sorted_eddies;
unsigned_array date_chunk_starts;

/* [0] "Current dimension 0"
   [1] "Current dimension 1"
   [2] Temporary copy of current dimension 0.

   "Current dimension 0" cycles between latitude and longitude,
   depending on the current kd-tree construction iteration.  */
#define KD_DIMS 2
SortedEddy_array kd_curdim[KD_DIMS+1];

bool put_short_in_range(FILE *fout, unsigned value);
int parse_json(FILE *fp, unsigned eddy_type);
void add_eddy(InputEddy *ieddy, unsigned eddy_type,
	      bool start_of_track);
int qs_date_cmp(const void *p1, const void *p2, void *arg);
int qs_lat_cmp(const void *p1, const void *p2);
int qs_lon_cmp(const void *p1, const void *p2);
void qs_eddy_swap(void *p1, void *p2, void *arg);
void kd_eddy_move(SortedEddy *dest, SortedEddy *src);
void kd_tree_build(unsigned begin_start, unsigned begin_length);

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
"  -o OUTPUT    Send output to a named file (standard output by default).\n",
fout);
}

int main(int argc, char *argv[]) {
  int retval = 0;
  bool diag_proc = false;
  bool build_kd = true;
  FILE *fdiag = NULL;
  FILE *fout = stdout;

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
    else
      break;
    argv++;
  }

  if (*argv == NULL) {
    fputs("Error: Invalid command line.\n", stderr);
    return 1;
  }

  tot_num_tracks = 0;
  EA_INIT(SortedEddy, sorted_eddies, 1048576);
  EA_INIT(unsigned, date_chunk_starts, 16);
  EA_INIT(SortedEddy, kd_curdim[0], 16);
  EA_INIT(SortedEddy, kd_curdim[1], 16);
  EA_INIT(SortedEddy, kd_curdim[2], 16);

  /* Start by reading all of the input data into a data structure in
     memory.  */
  if (diag_proc)
    fprintf(stderr, "Parsing input...\n");

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
    fprintf(stderr, "Done parsing: %u tracks, %u total eddies.\n",
	    tot_num_tracks, sorted_eddies.len);
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
    if (sorted_eddies.d[0].date_index == 0) {
      fputs("Error: Date indexes may not equal zero.\n", stderr);
      EA_APPEND(date_chunk_starts, 0);
      retval = 1; /* goto cleanup; */
    }
    for (i = 0; i < sorted_eddies.len; i++) {
      unsigned date_index_diff =
	sorted_eddies.d[i].date_index - last_date_index;
      if (date_index_diff == 1) {
	EA_APPEND(date_chunk_starts, i);
	last_date_index = sorted_eddies.d[i].date_index;
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

    for (i = 0; i < date_chunk_starts.len - 1; i++) {
      SortedEddy *start = sorted_eddies.d + date_chunk_starts.d[i];
      unsigned length = date_chunk_starts.d[i+1] - date_chunk_starts.d[i];

      /* First sort the eddies by latitude.  */
      EA_SET_SIZE(kd_curdim[0], length);
      memcpy(kd_curdim[0].d, start, sizeof(SortedEddy) * length);
      qsort(kd_curdim[0].d, kd_curdim[0].len,
	    sizeof(SortedEddy), qs_lat_cmp);

      /* Now sort by longitude.  */
      EA_SET_SIZE(kd_curdim[1], length);
      memcpy(kd_curdim[1].d, start, sizeof(SortedEddy) * length);
      qsort(kd_curdim[1].d, kd_curdim[1].len,
	    sizeof(SortedEddy), qs_lon_cmp);

      /* Make sure to initialize the temporary array.  */
      EA_SET_SIZE(kd_curdim[2], length);

      /* Build the actual kd-tree for this date range.  */
      kd_tree_build(0, length);

      { /* Copy the finished kd-tree back to the official location
	   within `sorted_eddies', rebasing the pointers as
	   necessary.  */
	unsigned j;
	for (j = 0; j < length; j++)
	  kd_eddy_move(start + j, &kd_curdim[0].d[j]);
      }
    }
  }

  if (diag_proc)
    fprintf(stderr, "Writing output...\n");

  { /* Output the new JSON data as UTF-16 characters.  Each character
       will be treated as a 15-bit fixed point number on input.
       (There is also support for quasi-16-bit unsigned integers that
       range from 0x0000 to 0xd7fe, or even up to 0xf7fe.)  Newlines
       are written out at regular intervals for safety.  Null
       characters must never be stored in the output stream.  */
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
      const char *file_type =
"# Binary eddy tracks data for the Ocean Eddies Web Viewer.\n"
"# For more information on this file format, see the following webpage:\n"
"# <http://example.com/dev_url>\n"
"#\n"
"# BEGIN_DATA\n";
      const char *cur_pos = file_type;
      while (*cur_pos != '\0') {
	PUT_SHORT(*cur_pos);
	cur_pos++;
      }
    }

    /* Write out the value that represents zero, since null characters
       cannot be stored literally.  */
    { /* Write the format header.  */
      unsigned short format_bits = 0x01;
      if (max_utf_range)
	format_bits |= 0x02;
      PUT_SHORT(format_bits);
    }

    /* Convert the date chunk start indexes structure to an eddies per
       date index structure, and output that structure.  */
    ERROR_OR_PUT_SHORT(date_chunk_starts.len - 1,
		       "Error: i = %u: Too many date indexes: %u\n");
    PUT_SHORT('\n');
    for (i = 1; i < date_chunk_starts.len; i++) {
      unsigned num_dates = date_chunk_starts.d[i] - date_chunk_starts.d[i-1];
      ERROR_OR_PUT_SHORT(num_dates,
		 "Error: i = %u: Too many eddies on date index: %u.\n");
      if (i % 32 == 0)
	{ PUT_SHORT('\n'); }
    }

    /* Next output the optimized eddy entries.  */
    for (i = 0; i < sorted_eddies.len; i++) {
      SortedEddy *seddy = &sorted_eddies.d[i];
      unsigned int_lat = ((unsigned)(seddy->coords[0] * (1 << 6)) +
			  (1 << 13)) & 0x3fff;
      unsigned int_lon = ((unsigned)(seddy->coords[1] * (1 << 6)) +
			  (1 << 14)) & 0x7fff;
      unsigned rel_next = (seddy->next == NULL) ? 0 :
	((seddy->next - sorted_eddies.d) - i);
      unsigned rel_prev = (seddy->prev == NULL) ? 0 :
	(i - (seddy->prev - sorted_eddies.d));

      if (seddy->coords[0] < -90 || seddy->coords[0] > 90) {
	fprintf(stderr, "Error: i = %u: Latitude out of range: %f\n",
		i, seddy->coords[0]);
	retval = 1; /* goto cleanup; */
      }
      if (seddy->coords[1] < -180 || seddy->coords[1] > 180) {
	fprintf(stderr, "Error: i = %u: Longitude out of range: %f\n",
		i, seddy->coords[1]);
	retval = 1; /* goto cleanup; */
      }
      if (seddy->eddy_index == 0) {
	fprintf(stderr,
		"Error: i = %u: Eddy indexes must never equal zero.\n", i);
	retval = 1; /* goto cleanup; */
      }

      /* Since latitudes only range from -90 to 90, the above encoding
	 for latitude only needs 14 bits.  This leaves room for
	 storing one extra bit of information in the same
	 character.  */
      /* The type information, which is only a zero or a one, can be
	 stored in the latitude field.  */
      int_lat |= seddy->type << 14;

      if (i % 32 == 0)
	{ PUT_SHORT('\n'); }

      PUT_SHORT(int_lat);
      PUT_SHORT(int_lon);
      ERROR_OR_PUT_SHORT(seddy->eddy_index,
			 "Error: i = %u: Eddy index too large: %u\n");
      /* NOTE: Some errors may cause the next or previous eddy offsets
	 to be negative, so we use %d instead of %u for diagnostic
	 convenience.  */
      ERROR_OR_PUT_SHORT(rel_next,
			 "Error: i = %u: Next eddy offset too large: %d\n");
      ERROR_OR_PUT_SHORT(rel_prev,
		 "Error: i = %u: Previous eddy offset too large: %d\n");

      if (fdiag != NULL)
	fprintf(fdiag,
		"i = %-5u            Type: %-5u\n"
		"Latitude: %-7.2f    Longitude: %-7.2f\n"
		"Date index: %-5u    Eddy index: %-5u\n"
		"Next index: %-5u    Previous index: %-5u\n\n",
		i, seddy->type,
		seddy->coords[0], seddy->coords[1],
		seddy->date_index, seddy->eddy_index,
		seddy->next - sorted_eddies.d, seddy->prev - sorted_eddies.d);
    }

    /* Put a newline at the end of the data for good measure.  */
    PUT_SHORT('\n');
  }

  /* retval = 0; */
 cleanup:
  EA_DESTROY(sorted_eddies);
  EA_DESTROY(date_chunk_starts);
  EA_DESTROY(kd_curdim[0]);
  EA_DESTROY(kd_curdim[1]);
  EA_DESTROY(kd_curdim[2]);
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
   numeric range.  */
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
	add_eddy(&cur_eddy, eddy_type, start_of_track);
	start_of_track = false;
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

/* Add an eddy to the eddy-indexed array.  NOTE: Because the array's
   base address is constantly changing during construction, the `next'
   and `prev' pointers use zero as their base address.  */
void add_eddy(InputEddy *ieddy, unsigned eddy_type, bool start_of_track) {
  SortedEddy *seddy = &sorted_eddies.d[sorted_eddies.len];
  seddy->type = eddy_type;
  seddy->coords[0] = ieddy->lat;
  seddy->coords[1] = ieddy->lon;
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
}

/* `qsorts_r()' date comparison function.  */
int qs_date_cmp(const void *p1, const void *p2, void *arg) {
  const SortedEddy *se1 = (const SortedEddy*)p1;
  const SortedEddy *se2 = (const SortedEddy*)p2;
  return se1->date_index - se2->date_index;
}

/* `qsorts_r()' latitude comparison function.  */
int qs_lat_cmp(const void *p1, const void *p2) {
  const SortedEddy *se1 = (const SortedEddy*)p1;
  const SortedEddy *se2 = (const SortedEddy*)p2;
  float cmp = se1->coords[0] - se2->coords[0];
  if (cmp > 0.0)
    return 1;
  else if (cmp < 0.0)
    return -1;
  return 0;
}

/* `qsorts_r()' longitude comparison function.  */
int qs_lon_cmp(const void *p1, const void *p2) {
  const SortedEddy *se1 = (const SortedEddy*)p1;
  const SortedEddy *se2 = (const SortedEddy*)p2;
  float cmp = se1->coords[1] - se2->coords[1];
  if (cmp > 0.0)
    return 1;
  else if (cmp < 0.0)
    return -1;
  return 0;
}

/* `qsorts_r()' swapping function that rearranges linked lists as
   necessary.  */
void qs_eddy_swap(void *p1, void *p2, void *arg) {
  SortedEddy *se1 = (SortedEddy*)p1;
  SortedEddy *se2 = (SortedEddy*)p2;
  SortedEddy temp;

  /* Rearrange the linked list indexes.  */

  if (se1->next == se2) se1->next = se1;
  else if (se1->next != NULL) se1->next->prev = se2;

  if (se1->prev == se2) se1->prev = se1;
  else if (se1->prev != NULL) se1->prev->next = se2;

  if (se2->next == se1) se2->next = se2;
  else if (se2->next != NULL) se2->next->prev = se1;

  if (se2->prev == se1) se2->prev = se2;
  else if (se2->prev != NULL) se2->prev->next = se1;

  /* Swap the memory quantities verbatim.  */
  memcpy(&temp, se1, sizeof(SortedEddy));
  memcpy(se1, se2, sizeof(SortedEddy));
  memcpy(se2, &temp, sizeof(SortedEddy));
}

/* Similar to the `swap()' function above, this function handles
   rearranging the list links when an eddy gets moved to a new memory
   address.  */
void kd_eddy_move(SortedEddy *dest, SortedEddy *src) {
  if (src->next != NULL) src->next->prev = dest;
  if (src->prev != NULL) src->prev->next = dest;
  memcpy(dest, src, sizeof(SortedEddy));
}

/* NOTE: Thanks to the glibc `qsort()' function for providing a good
   example of how to implement the software stack of `kd_tree_build()'
   in an efficient way.

   This function builds a 2D kd-tree based off of the latitudes and
   longitudes of the given input eddies.  The input should have been
   presorted by each dimension into `kd_curdim'.  The finished kd-tree
   is stored in `kd_curdim[0]'.  You must copy `kd_curdim[0]' to a
   separate storage location using `kd_eddy_move()' to have a useful
   data structure.  */

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

void kd_tree_build(unsigned begin_start, unsigned begin_length) {
  /* Note: The algorithms used to preprocess the data before this
     algorithm ensure that the number of eddies on a certain date
     index never equals zero.  Thus, it is not necessary to check if
     (length == 0).  */

  unsigned start = begin_start;
  unsigned length = begin_length;
  unsigned depth = 0;
  kd_stack_node stack[QS_STACK_SIZE];
  kd_stack_node *top = stack;

  /* Set the `length' on the bogus first stack entry to 3 to simplify
     the `KD_POP()' loop below.  */
  KD_PUSH(0, 3, 0);

  while (QS_STACK_NOT_EMPTY) {
    unsigned real_curdim; /* "Real" current dimension (lat or lon) */
    unsigned median, end;
    float median_val;
    /* End indexes (index just beyond last element) of subarrays.
       Note: In this usage, `right_subend' includes the median element
       as the first element of the subarray.  */
    unsigned left_subend, right_subend;
    bool median_moved;
    unsigned i, j;

    /* 1. Pick the median point at the current dimension.  */
    real_curdim = depth % 2;
    /* TODO: Might need better median choosing equation.  */
    median = start + length / 2; end = start + length;
    /* Verify the median represents a `>=' division.  */
    while (median > start &&
	   kd_curdim[0].d[median-1].coords[real_curdim] ==
	     kd_curdim[0].d[median].coords[real_curdim])
      median--;
    median_val = kd_curdim[0].d[median].coords[real_curdim];

    /* 2. Make a temporary copy of kd_curdim[0].  */
    memcpy(kd_curdim[KD_DIMS].d + start, kd_curdim[0].d + start,
	   sizeof(SortedEddy) * length);

    /* 3. Shift to the next current dimension by constructing the
       `curdim + 1' points in `curdim'.  Note that pointer rebasing
       can be delayed until the kd-tree construction is finished,
       since within a date index chunk, the pointers are either NULL
       (point to themselves) or point outside the current date index
       chunk.  */
    for (j = 0; j < KD_DIMS; j++) {
      left_subend = start; right_subend = median + 1;
      median_moved = false;
      for (i = start; i < end; i++) {
	float cmp = kd_curdim[j+1].d[i].coords[real_curdim] - median_val;
	if (cmp < 0) /* Left */
	  memcpy(&kd_curdim[j].d[left_subend++], &kd_curdim[j+1].d[i],
		 sizeof(SortedEddy));
	else if (!median_moved && cmp == 0.0 &&
		 !memcmp(&kd_curdim[j+1].d[i],
			 &kd_curdim[0].d[median],
			 sizeof(SortedEddy))) { /* Median */
	  memcpy(&kd_curdim[j].d[median], &kd_curdim[j+1].d[i],
		 sizeof(SortedEddy));
	  median_moved = true;
	} else /* Right */
	  memcpy(&kd_curdim[j].d[right_subend++], &kd_curdim[j+1].d[i],
		 sizeof(SortedEddy));
      }
    }

    { /* 4. Recurse on the left and right subarrays.  */
      unsigned left_len = left_subend - start;
      unsigned right_len = right_subend - (median + 1);
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
}
