all:
	$(MAKE) -C src
	$(MAKE) -C tests

install:
	$(MAKE) -C src install

.PHONY:: docs

docs:
	$(MAKE) -C src docs

# NOTE: `tests' must be cleaned before `src' to prevent problems with
# missing dependencies.
clean:
	$(MAKE) -C tests clean
	$(MAKE) -C src clean
