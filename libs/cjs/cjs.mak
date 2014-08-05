# GNU Make -*- makefile -*- rules for compiling files in projects that
# use cjs.

# Choose one of the following:
TARGETS = $(SOURCES:.js=.hjs)
# TARGETS = $(SOURCES:.cjs=.hjs)
# BSD style: TARGETS = $(SOURCES:S/.js$/.hjs/g:S/.cjs$/.hjs/g)

.SUFFIXES:: .c .js .cjs .hjs .hjs.d .djs

.c.js:
	CPP=$(CPP) $(cjs_dir)/converter <$< >$@

.cjs.js:
	CPP=$(CPP) $(cjs_dir)/jsize.sh $< -o $@

.cjs.c:
	CPP=$(CPP) $(cjs_dir)/cppize.sh $< -o $@

.js.hjs:
	CPP=$(CPP) $(cjs_dir)/hjsprep.sh $< -o $@

.js.djs:
	CPP=$(CPP) $(cjs_dir)/djsprep.sh $< -o $@

.hjs.hjs.d: $(TARGETS)
	@set -e; $(CPP) -M $< | \
	  sed -e 's,\($*\)\.hjs,\1.js,g' \
	    -e 's,\($*\)\.o[ :]*,\1.hjs $@ : ,g' >$@

# Note: This include line only works in GNU Make.
include $(TARGETS:.hjs=.hjs.d)

# BSD Make uses the following alternate syntax:
# .include "$(FILE1_HJSD)"
# .include "$(FILE2_HJSD)"
# ...

# Additionally, non-GNU makes cannot automatically generate a missing
# makefile.

clean::
	rm -f *.hjs *.hjs.d
