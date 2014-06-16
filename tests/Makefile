CPP = cpp
cjs_dir = ../libs/cjs
SOURCES = cothread_test.js trackslayer_test.js sshlayer_test.js
BUNDLES = $(SOURCES:.js=.b.js)
CPATH = ../src

all: $(BUNDLES)

include $(cjs_dir)/cjs.mak

# Note: All files must have "_test" appended to their name so that
# they do not create problems with the cjs's C preprocessor-based
# include mechanism.

cothread_test.b.js: cothread_test.hjs
	$(cjs_dir)/hjssmash.sh $< -o $@

trackslayer_test.b.js: trackslayer_test.hjs
	$(cjs_dir)/hjssmash.sh $< -o $@

sshlayer_test.b.js: sshlayer_test.hjs
	$(cjs_dir)/hjssmash.sh $< -o $@

clean::
	rm -f $(BUNDLES)
