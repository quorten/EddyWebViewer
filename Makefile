all:
	$(MAKE) -C src
	$(MAKE) -C tests

# NOTE: `tests' must be cleaned before `src' to prevent problems with
# missing dependencies.
clean:
	$(MAKE) -C tests clean
	$(MAKE) -C src clean
