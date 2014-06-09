CPP = cpp
cjs_dir = ../libs/cjs
SOURCES = ../src/cothread.js cttest.js
TEST_JS = cttest.b.js

all: $(TEST_JS)

include $(cjs_dir)/cjs.mak

cttest.b.js: cttest.hjs
	$(cjs_dir)/hjssmash.sh $< -o $@

clean::
	rm -f $(TEST_JS)
