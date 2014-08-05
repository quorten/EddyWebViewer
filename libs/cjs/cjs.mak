# GNU Make -*- makefile -*- rules for compiling files in projects that
# use cjs.

TARGETS = $(SOURCES:.js=.hjs)

.SUFFIXES:: .c .js .hjs .hjs.d .djs

.c.js:
	CPP=$(CPP) $(cjs_dir)/converter <$< >$@

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
