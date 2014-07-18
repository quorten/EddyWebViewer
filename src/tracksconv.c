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
#include <time.h>
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
  float lat;
  float lon;
  unsigned date_index;
  unsigned eddy_index;
  /* unsigned unsorted_index; */
  /* Pointer of the next eddy in a track.  If there is no next eddy,
     then this points to the current eddy itself.  */
  SortedEddy *next;
  SortedEddy *prev;
};

EA_TYPE(SortedEddy);
EA_TYPE(unsigned);

unsigned tot_num_tracks;
SortedEddy_array sorted_eddies;
unsigned_array date_chunk_starts;

int parse_json(FILE *fp, unsigned eddy_type);
inline void add_eddy(InputEddy *ieddy, unsigned eddy_type,
		     bool start_of_track);
int qs_date_cmp(const void *p1, const void *p2, void *arg);
int qs_lat_cmp(const void *p1, const void *p2, void *arg);
int qs_lon_cmp(const void *p1, const void *p2, void *arg);
void qs_eddy_swap(void *p1, void *p2, void *arg);

int main(int argc, char *argv[]) {
  int retval = 0;
  bool diag_proc = false;
  FILE *fdiag = NULL;

  if (argc < 2) {
    fprintf(stderr, "Usage: %s [-v] [-vv diag-file]\n"
	    "    [TYPE file TYPE file ...] [TYPE TYPE ... <INPUT] >OUTPUT\n",
	    argv[0]);
    fprintf(stderr, "TYPE is 0 for an anticyclonic tracks JSON and 1 "
	    "for a cyclonic tracks JSON.\n");
    fputs(
"Specify -v for computational diagnostics, -vv for data diagnostics that are\n"
"output to the given file.\n", stderr);
    return 1;
  }

  argv++;
  if (!strcmp(*argv, "-v")) {
    diag_proc = true; argv++;
  }
  if (*argv != NULL && !strcmp(*argv, "-vv")) {
    char *diagname = *++argv; argv++;
    fdiag = fopen(diagname, "wt");
    if (fdiag == NULL) {
      fprintf(stderr, "Error: Could not open %s: %s\n",
	      diagname, strerror(errno));
      return 1;
    }
  }

  if (*argv == NULL) {
    fputs("Error: Invalid command line.\n", stderr);
    return 1;
  }

  tot_num_tracks = 0;
  EA_INIT(SortedEddy, sorted_eddies, 1048576);
  EA_INIT(unsigned, date_chunk_starts, 16);

  /* Start by reading all of the input data into a data structure in
     memory.  */
  if (diag_proc)
    fprintf(stderr, "Parsing input...\n");

  while (*argv != NULL) {
    char *filename;
    FILE *fp;
    int parse_status;

    unsigned eddy_type = atoi(*argv++);
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
      sorted_eddies.d[i].next = sorted_eddies.d + next_idx;
      sorted_eddies.d[i].prev = sorted_eddies.d + prev_idx;
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
    /* NOTE: Since the first date index is one, setting
       last_date_index to zero will guarantee that the first iteration
       adds a chunk start index.  */
    unsigned last_date_index = 0;
    for (i = 0; i < sorted_eddies.len; i++) {
      unsigned date_index_diff = sorted_eddies.d[i].date_index - last_date_index;
      if (date_index_diff == 1) {
	EA_APPEND(date_chunk_starts, i);
	last_date_index = sorted_eddies.d[i].date_index;
      } else if (date_index_diff != 0) {
	if (last_date_index == 0) {
	  fputs("Error: The first date index must be equal to one.\n", stderr);
	} else {
	  fputs("Error: Eddies must occupy every date index.\n", stderr);
	  fprintf(stderr, "The eddies skip from date index %u to %u.\n",
		  last_date_index, sorted_eddies.d[i].date_index);
	}
	retval = 1; /* goto cleanup; */
      }
    }
    /* For convenience, append one last entry equal to the total
       number of eddies.  */
    EA_APPEND(date_chunk_starts, i);
  }

  if (diag_proc)
    fprintf(stderr, "Done: %u date indexes.\n", date_chunk_starts.len - 1);

  /* TODO: Build the eddies in each date range into a kd-tree.  */

  if (diag_proc)
    fprintf(stderr, "Writing output...\n");

  { /* Output the new JSON data as UTF-16 characters.  Each character
       will be treated as a 15-bit fixed point number on input.
       Newlines are written out at regular intervals for safety.  If
       necessary, the codepoint is also incremented by one to avoid
       storing null characters.  */
    unsigned i = 0;

    /* Little endian will be used for this encoding.  */
#define PUT_SHORT(var) \
    putc((var) & 0xff, stdout); \
    putc(((var) >> 8) & 0xff, stdout)
#define ERROR_OR_PUT_SHORT(var, errmsg) \
    if ((unsigned)var > (unsigned)(1 << 15) - 1) { \
      fprintf(stderr, errmsg, i, var); \
      retval = 1; /* goto cleanup; */ \
    } else { \
      PUT_SHORT(var); \
    }

    PUT_SHORT(0xfeff); /* BOM (Byte Order Mask) */

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
      unsigned int_lat = ((unsigned)(seddy->lat * (1 << 6)) +
			  (1 << 13)) & 0x3fff;
      unsigned int_lon = ((unsigned)(seddy->lon * (1 << 6)) +
			  (1 << 14)) & 0x7fff;
      unsigned slist_next = (seddy->next - sorted_eddies.d) - i;

      if (seddy->lat < -90 || seddy->lat > 90) {
	fprintf(stderr, "Error: i = %u: Latitude out of range: %f\n",
		i, seddy->lat);
	retval = 1; /* goto cleanup; */
      }
      if (seddy->lon < -180 || seddy->lon > 180) {
	fprintf(stderr, "Error: i = %u: Longitude out of range: %f\n",
		i, seddy->lon);
	retval = 1; /* goto cleanup; */
      }
      if (seddy->eddy_index == 0) {
	fprintf(stderr,
		"Error: i = %u: Eddy indexes must never equal zero.\n", i);
	retval = 1; /* goto cleanup; */
      }
      if ((unsigned)slist_next > (unsigned)(1 << 15) - 1) {
	/* NOTE: Some errors may cause the next eddy offset to be
	   negative, so we use %d instead of %u for diagnostic
	   convenience.  */
	fprintf(stderr,
		"Error: i = %u: Next eddy offset too large: %d\n",
		i, slist_next);
	retval = 1; /* goto cleanup; */
      }

      /* Since latitudes only range from -90 to 90, the above encoding
	 for latitude only needs 14 bits.  This leaves room for
	 storing one extra bit of information in the same character.
	 Thus, the type information, which is only a zero or a one,
	 can conveniently be stored in that space.  */
      int_lat |= seddy->type << 14;

      if (i % 32 == 0)
	{ PUT_SHORT('\n'); }

      PUT_SHORT(int_lat);
      PUT_SHORT(int_lon);
      ERROR_OR_PUT_SHORT(seddy->eddy_index,
			 "Error: i = %u: Eddy index too large: %u\n");
      /* It's okay for this number to barely dip into the 16-bit
	 range: it will still be small enough not to touch any
	 dangerous codepoints.  */
      PUT_SHORT(slist_next + 1);

      if (fdiag != NULL)
	fprintf(fdiag,
		"i = %-5u            Type: %-5u\n"
		"Latitude: %-7.2f    Longitude: %-7.2f\n"
		"Date index: %-5u    Eddy index: %-5u\n"
		"Next index: %-5u    Previous index: %-5u\n\n",
		i, seddy->type,
		seddy->lat, seddy->lon,
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
  if (fdiag != NULL)
    fclose(fdiag);
  return retval;
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
    while (isspace(c = getc(fp)));
    ungetc(c, fp);

#define FSCANF_OR_ERROR(format, param) \
    c = fscanf(fp, format, param); \
    if (c == EOF) { \
      fputs("Error: Unexpected end of input.\n", stderr); \
      return 1; \
    } \
    if (c != 1) { \
      fputs("Error: An expected input parameter could not be " \
	    "read during parsing.\n", stderr); \
      return 1; \
    }

    if (nest_level == 3) {
      switch (eddy_param_index++) {
      case 0: FSCANF_OR_ERROR("%f", &cur_eddy.lat); break;
      case 1: FSCANF_OR_ERROR("%f", &cur_eddy.lon); break;
      case 2: FSCANF_OR_ERROR("%u", &cur_eddy.date_index); break;
      case 3: FSCANF_OR_ERROR("%u", &cur_eddy.eddy_index); break;
      }
    }

    while (isspace(c = getc(fp)));
    if (c == ',')
      /* Just skip the separator.  */;
    else if (c == '[') {
      nest_level++;
      if (nest_level == 2) {
	tot_num_tracks++;
	start_of_track = true;
      }
      if (nest_level == 3)
	eddy_param_index = 0;
    } else if (c == ']') {
      if (nest_level == 3) {
	add_eddy(&cur_eddy, eddy_type, start_of_track);
	start_of_track = false;
      }
      nest_level--;
    } else if (c == EOF) {
      fputs("Error: Unexpected end of input.\n", stderr);
    } else {
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
  seddy->lat = ieddy->lat;
  seddy->lon = ieddy->lon;
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
int qs_lat_cmp(const void *p1, const void *p2, void *arg) {
  const SortedEddy *se1 = (const SortedEddy*)p1;
  const SortedEddy *se2 = (const SortedEddy*)p2;
  float cmp = se1->lat - se2->lat;
  if (cmp > 0.0)
    return 1;
  else if (cmp < 0.0)
    return -1;
  return 0;
}

/* `qsorts_r()' longitude comparison function.  */
int qs_lon_cmp(const void *p1, const void *p2, void *arg) {
  const SortedEddy *se1 = (const SortedEddy*)p1;
  const SortedEddy *se2 = (const SortedEddy*)p2;
  float cmp = se1->lon - se2->lon;
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

  if (se1->next == se1) se1->next = se2;
  else if (se1->next == se2) se1->next = se1;
  else se1->next->prev = se2;

  if (se1->prev == se1) se1->prev = se2;
  else if (se1->prev == se2) se1->prev = se1;
  else se1->prev->next = se2;

  if (se2->next == se2) se2->next = se1;
  else if (se2->next == se1) se2->next = se2;
  else se2->next->prev = se1;

  if (se2->prev == se2) se2->prev = se1;
  else if (se2->prev == se1) se2->prev = se2;
  else se2->prev->next = se1;

  /* Swap the memory quantities verbatim.  */
  memcpy(&temp, se1, sizeof(SortedEddy));
  memcpy(se1, se2, sizeof(SortedEddy));
  memcpy(se2, &temp, sizeof(SortedEddy));
}
