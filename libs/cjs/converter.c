/* A C/C++ translator that can convert to JavaScript.  */
/* Compile: cc converter.c xmalloc.c -o converter */

/* Notable ommissions from this translator:

 * This translator does not eliminate pointer syntax, with the
   exception of the -> operator.  Use typedefs and array syntax in
   your code to sidestep this issue.

 * This translator does not translate for loops written as
     for (int i = 0; i < n; i++) ...
   Write the loop as
     int i; for (i = 0; i < n; i++) ...
   instead.

 * Useless code such as
     if (1) int useless_var;
   does not translate correctly.

 * This translator has no way to determine if an expression such as
     type ident ( ident1, ident2 ) ;
   at the global scope is a function prototype or a globally variable
   with C++ class initialization.

 * This translator cannot handle function pointer typedefs.

 * The parser does not save the line and column numbers of tokens
   returned to it from the translator.

 * This parser does not compare strings efficiently: it just uses a
   linear series of strcmp () string comparisons to determine the
   class of a token.

 * Some of the code in the parser has just been copied and pasted
   around to get the job done.

 * Currently, the lexical analyzer does not convert DOS and Mac
   newlines into Unix newlines.

 * Since comments and whitespace get merged together, some parts of
   this parser that discard extra whitespace are unfortunately a
   little too aggressive.

*/

/* %{ */

#include <stdio.h>
#include <string.h>

#include "xmalloc.h"
#include "exparray.h"

enum bool_tag { false, true };
typedef enum bool_tag bool;

EA_TYPE(char);
#define YYSTYPE char_array
int yylex (void);
void yyerror (char const *);

struct {
  int first_line;
  int first_column;
  int last_line;
  int last_column;
} yylloc;

/* %} */

/********************************************************************/
/* Token Declarations */

/* Basic formatting */
#define WHITESPACE 256
#define BLOCK_COMMENT 257
#define LINE_COMMENT 258
#define IDENT 259 /* Identifier */
#define NUM_LIT 260 /* Numeric literal */
#define STR_LIT 261 /* String literal */
#define CHAR_LIT 262 /* Character literal string such as 'c' */
#define MISC_CHAR 263 /* A character we only care to pass through our parser */

/* Declaration keywords */
#define KINT 264
#define KCHAR 265
#define KFLOAT 266
#define KDOUBLE 267
#define KVOID 268
#define KLONG 269
#define KSHORT 270
#define KUNSIGNED 271
#define KSIGNED 272
#define KCONST 273
#define KBOOL 274
#define KSTATIC 275

#define KSIZEOF 276
#define KTYPEDEF 277

/* Control flow keywords */
#define KIF 278
#define KELSE 279
#define KWHILE 280
#define KDO 281
#define KFOR 282
#define KBREAK 283
#define KCONTINUE 284
#define KSWITCH 285
#define KCASE 286
#define KDEFAULT 287
#define KRETURN 288
#define KGOTO 289

/* "Preprocessor" tokens */
#define K_MAYBE_IFDEF 290
#define K_MAYBE_IFNDEF 291
#define K_MAYBE_ENDIF 292
#define K_MAYBE_DEFINE 293
#define K_MAYBE_DEFINED 294
#define K_MAYBE_INCLUDE 295
#define K_MAYBE_PRAGMA 296

/* C/C++ object oriented keywords */
#define KSTRUCT 297
#define KCLASS 298
#define KPUBLIC 299
#define KPROTECTED 300
#define KPRIVATE 301
#define KFRIEND 302
#define KVIRTUAL 303
#define KNAMESPACE 304
#define KUSING 305
#define KNEW 306
#define KDELETE 307

/* Java keywords */
#define KBOOLEAN 308
#define KEXTENDS 309
#define KIMPLEMENTS 310
#define KFINAL 311
#define KPACKAGE 312

/* JavaScript keywords */
#define KFUNCTION 313
#define KVAR 314

/* Derivative constructs */
#define SEM_SPACE 315 /* Semantic space: whitespace or comments */
#define K_IFDEF 316
#define K_IFNDEF 317
#define K_ENDIF 318
#define K_DEFINE 319
#define K_DEFINED 320
#define K_INCLUDE 321
#define K_PRAGMA 322

/********************************************************************/
/* Parser */

YYSTYPE yylval;

typedef char* char_ptr;
EA_TYPE(char_ptr);

struct Token_tag {
  int type;
  char *val;
};
typedef struct Token_tag Token;
EA_TYPE(Token);

struct NestLevel_tag {
  int brace;
  int paren;
  int bracket;
};
typedef struct NestLevel_tag NestLevel;

#define TOKEN_STACK_PUSH \
  EA_NORMALIZE(yylval); \
  token_stack.d[token_stack.len].type = token_type; \
  token_stack.d[token_stack.len].val = yylval.d; \
  EA_ADD(token_stack); \
  EA_INIT (char, yylval, 128)

/* Remove the token on the bottom of the stack in a queue-like
   manner.  */
#define TS_QUEUE_DROP \
  xfree (token_stack.d[0].val); \
  EA_POP_FRONT (token_stack); \
  if (pa > 0) pa--;

/* Remove the token at the bottom of the stack and print it out.  */
#define TS_QUEUE_OUT \
  fputs (token_stack.d[0].val, stdout); \
  TS_QUEUE_DROP

#define EMPTY_TOKEN_STACK \
  { \
    unsigned i; \
    for (i = 0; i < token_stack.len; i++) { \
      fputs (token_stack.d[i].val, stdout); \
      xfree (token_stack.d[i].val); \
    } \
    EA_CLEAR(token_stack); \
    pa = 0; \
  }

#define DISCARD_PA_STACK \
  { \
    unsigned i; \
    for (i = 0; i < pa; i++) \
      xfree (token_stack.d[i].val); \
    EA_REMOVE_MULT (token_stack, 0, pa); \
    pa = 0; \
  }

#define EMIT_PA_STACK \
  { \
    unsigned i; \
    for (i = 0; i < pa; i++) { \
      fputs (token_stack.d[i].val, stdout); \
      xfree (token_stack.d[i].val); \
    } \
    EA_REMOVE_MULT (token_stack, 0, pa); \
    pa = 0; \
  }

#define DUMP_LAST_TOKEN \
  fputs (yylval.d, stdout)

#define PAREN_ERROR(c) \
  char error_desc[] = "Too many }'s"; \
  error_desc[9] = c; \
  yyerror (error_desc); \
  break;

/* FIXME: IS_SEM_SPACE() should not be necessary: all non-merged
   whitespace should be converted to the SEM_SPACE type before the
   parser body.  */

/* Is this token type semantic space?  */
#define IS_SEM_SPACE(token) \
  (token == SEM_SPACE || token == WHITESPACE || token == '\n' || \
   token == BLOCK_COMMENT || token == LINE_COMMENT)

/* Identifiers that correspond to a type.  */
char_ptr_array type_idents;

/* Minimalistic type identifier checking.  */
#define IS_TYPE_IDENT_FAST(type) (type >= KINT && type <= KSTATIC)

bool is_type_ident (Token *token) {
  if (IS_TYPE_IDENT_FAST(token->type))
    return true;

  {
    unsigned i;
    for (i = 0; i < type_idents.len; i++) {
      if (!strcmp (type_idents.d[i], token->val))
	return true;
    }
  }
  return false;
}

#define MAYBE_TYPE_IDENT(type) (type == IDENT)

/* TODO

   * Obvious giveaways that something is a "command" and not a
     declaration: The first non-whitespace is '(', '*', or '&'.

   * Automatically delete typecast operators.

   * The code should be more clear as to when the parse anchor is
     desired and necessary or not.
 */

/* This parser works by simply looking for some key token sequences
   and performing a command on those tokens of interest and passing
   through all other tokens unchanged.  It happens that using a parser
   generated from a formal grammar is not very amenable to this task,
   so a custom, simplified parser is used instead.  This also means
   that this parser is very incomplete and will often pass through
   invalid grammar in interesting ways rather than halt on error.

   The most difficult part of this parser is to rewrite variable
   declarations.  The following informal grammar definitions summarize
   the process used by the parser to determine if some tokens comprise
   a variable declaration:

Basic definitions:

ssp: semantic space (whitespace, newline, comment)
osp: optional semantic space
ident: Maybe type identifier (includes type keywords)
       Specifically excludes some keywords such as "if", "new", ...
tident: Definitely type identifier
command: Something we don't care about (scan it and pass it through)
cmdop: '=' | '+=' | '*=' ...

For brevity, semantic space indications will not be included in the
following descriptions.

statement: (decl | command) ';'
very_likely_decl: ident ('*' | '&') ident ...
definitely_command: ident cmdop ...
definitely_decl: tident ...
definitely_decl: ident ident ...
decl_with_ctor: ident ident '(' ...  <!-- Not actually used -->
function_proto: decl ... ';'  <!-- Only matches at global scope -->
function_def: decl ... '{'

   Once type indicators have definitely been found, the rest of the
   parsing until the semicolon is fairly straightforward.  Closing
   braces reset the parser state similar to how semicolons reset the
   parser state.

   We don't handle C++ template declarations.  That would be too
   complex.  A simple preprocessor can replace them with something
   more amenable to a simple parser.  Likewise with functions.

   Picking up type definitions in the source code is fairly easy: Just
   scan for "typedef", "struct", and "class" keywords.  For "typedef",
   just pick up the last identifier before the semicolon.  Function
   type declarations, on the other hand, are not so easy and therefore
   are not implemented.

   Most parsing of more detailed grammar is skipped by matching
   parentheses and passing through other tokens.

   If there are syntax errors in the input grammar, then this parser
   will respond in very strange and unexpected ways.

*/
int yyparse (void) {
  int retval;
  int token_type;
  Token_array token_stack;
  /* "Parse Anchor". This variable indicates where on the token stack
     the parser should start matching.  If this is greater than zero,
     then the tokens at the beginning of the stack are "saved" tokens
     that have already been parsed but not emptied.  */
  unsigned pa = 0;

  /* State machine variables */
  bool typedef_stmt = false;
  unsigned last_typedef_ident = 0;
  bool in_decl = false;
  bool very_likely_decl = false;
  unsigned last_decl_ident = 0;
  bool in_command = false;
  NestLevel levels = { 0, 0, 0 };
  bool in_param_decl = false;
  NestLevel pre_param_level = { 0, 0, 0 };

  EA_INIT (Token, token_stack, 16);
  EA_INIT (char_ptr, type_idents, 16);

  /* Initialize some identifiers known to be part of a type
     declaration.  */
  EA_APPEND (type_idents, xstrdup ("int"));
  EA_APPEND (type_idents, xstrdup ("char"));
  EA_APPEND (type_idents, xstrdup ("float"));
  EA_APPEND (type_idents, xstrdup ("double"));
  EA_APPEND (type_idents, xstrdup ("void"));
  EA_APPEND (type_idents, xstrdup ("long"));
  EA_APPEND (type_idents, xstrdup ("short"));
  EA_APPEND (type_idents, xstrdup ("unsigned"));
  EA_APPEND (type_idents, xstrdup ("signed"));
  EA_APPEND (type_idents, xstrdup ("const"));
  EA_APPEND (type_idents, xstrdup ("bool"));
  EA_APPEND (type_idents, xstrdup ("static"));

  while ((token_type = yylex ()) > 0 || token_stack.len > 0) {

    /* Token-stack agnostic actions come first.  */

    if (token_stack.len > 0) {
      Token *prev_token = &token_stack.d[token_stack.len-1];

#define MERGE_TOKENS \
      prev_token->val = (char*) xrealloc \
	(prev_token->val,  strlen (prev_token->val) + yylval.len); \
      strcat (prev_token->val, yylval.d)

      /* Merge contiguous semantic space constructs.  */
      if (IS_SEM_SPACE (prev_token->type) && IS_SEM_SPACE (token_type)) {
	MERGE_TOKENS;
	prev_token->type = SEM_SPACE;
	continue;
      }

      /* Replace "->" with '.'.  */
      if (prev_token->type == '-' && token_type == '>') {
	prev_token->type = '.';
	prev_token->val[0] = '.';
	continue;
      }

      /* Generate preprocessor tokens.  */
      if (prev_token->type == '#') {
	switch (token_type) {
	case K_MAYBE_IFDEF:
	  prev_token->type = K_IFDEF;
	  MERGE_TOKENS;
	 continue;
	case K_MAYBE_IFNDEF:
	  prev_token->type = K_IFNDEF;
	  MERGE_TOKENS;
	  continue;
	case K_MAYBE_ENDIF:
	  prev_token->type = K_ENDIF;
	  MERGE_TOKENS;
	  continue;
	case K_MAYBE_DEFINE:
	  prev_token->type = K_DEFINE;
	  MERGE_TOKENS;
	  continue;
	case K_MAYBE_DEFINED:
	  prev_token->type = K_DEFINED;
	  MERGE_TOKENS;
	  continue;
	case K_MAYBE_INCLUDE:
	  prev_token->type = K_INCLUDE;
	  MERGE_TOKENS;
	  continue;
	case K_MAYBE_PRAGMA:
	  prev_token->type = K_PRAGMA;
	  MERGE_TOKENS;
	  continue;
	}
      }
    }

    /* The parser needs to check the longest matching token sequences
       first.  Hence, the token stack must always contain at least 5
       tokens, except near the end of the stream.  */
    if (token_type > 0) {
      TOKEN_STACK_PUSH;
      if (token_stack.len -pa < 5)
	continue;
    }

    /* The following code always reads tokens from the stack and never
       from `token_type' or `yylval.d'.  */

    switch (token_stack.len -pa) {
    case 0: goto no_tokens;
    case 1: goto one_token;
    case 2: goto two_tokens;
    case 3: goto three_tokens;
    case 4: goto four_tokens;
    }

    /* This check requires three tokens but may consume up to five
       tokens.  Currently, this check requires five tokens on the
       stack.  */
    if (!typedef_stmt && !in_command && !in_decl && !very_likely_decl) {

      /* Check for a declaration.  */
      if (MAYBE_TYPE_IDENT (token_stack.d[pa+0].type)) {
	unsigned nt = pa+1; /* Next token */
	if (IS_SEM_SPACE(token_stack.d[nt].type))
	  nt++;
	if (token_stack.d[nt].type == '*' || token_stack.d[nt].type == '&') {
	  nt++;
	  if (IS_SEM_SPACE(token_stack.d[nt].type))
	    nt++;
	  if (is_type_ident (&token_stack.d[nt])) {
	    in_decl = true;
	    last_decl_ident = nt;
	    pa = nt + 1;
	    continue;
	  }
	  if (token_stack.d[nt].type == '*' || token_stack.d[nt].type == '&') {
	    in_decl = true;
	    last_decl_ident = nt;
	    pa = nt + 1;
	    continue;
	  }
	  if (MAYBE_TYPE_IDENT (token_stack.d[nt].type)) {
	    very_likely_decl = true;
	    last_decl_ident = nt;
	    pa = nt + 1;
	    continue;
	  }
	}
      }

    }

    /* The remaining checks only require four tokens on the stack.  */
  four_tokens:

    if (!typedef_stmt && !in_command && !in_decl && !very_likely_decl) {
      /* Check if this token definitely marks a command.  */
      /* FIXME: This check was buggy and is now ugly.  */
      if (!is_type_ident (&token_stack.d[pa+0]) && /* FIXME ugly */
	  token_stack.d[pa+0].type == IDENT) {
	unsigned nt = pa+1; /* Next token */
	if (IS_SEM_SPACE (token_stack.d[nt].type))
	  nt++;
	if ((token_stack.d[nt].type != '*' &&
	     token_stack.d[nt].type != '&' &&
	     !is_type_ident (&token_stack.d[nt]) && /* FIXME ugly */
	     !MAYBE_TYPE_IDENT(token_stack.d[nt].type)) ||
	    token_stack.d[nt+1].type == '=') {
	  in_command = true;
	  TS_QUEUE_OUT;
	  continue;
	}
      }
    }

    /* The remaining checks only require three tokens on the
       stack.  */
  three_tokens:

    if (!typedef_stmt && !in_command && !in_decl && !very_likely_decl) {
      /* Check for a declaration.  */
      if ((is_type_ident (&token_stack.d[pa+0]) ||
	   MAYBE_TYPE_IDENT (token_stack.d[pa+0].type)) &&
	  IS_SEM_SPACE (token_stack.d[pa+1].type) &&
	  (is_type_ident (&token_stack.d[pa+2]) ||
	   MAYBE_TYPE_IDENT (token_stack.d[pa+2].type))) {
	in_decl = true; /* Definitely a declaration.  */
	last_decl_ident = pa+2;
	pa += 3;
	continue;
      }
    }

    switch (token_stack.d[pa+0].type) {
    case KSTRUCT:
    case KCLASS:
      if (token_stack.d[pa+2].type == IDENT) {
	EA_APPEND (type_idents, xstrdup (token_stack.d[pa+2].val));
	TS_QUEUE_OUT; TS_QUEUE_OUT; TS_QUEUE_OUT;
	continue;
      }
      break;
    }

    /* The remaining checks require two tokens on the stack, but may
       optionally have a third token on the stack.  */
  two_tokens:

    if (!typedef_stmt && !in_command && !in_decl && !very_likely_decl) {
      unsigned nt = pa+1; /* Next token */
      unsigned nt_type; /* Next token type */
      if (IS_SEM_SPACE (token_stack.d[nt].type) && pa+2 < token_stack.len)
	nt++;
      nt_type = token_stack.d[nt].type;

      if (nt_type == ':') {
	switch (token_stack.d[pa+0].type) {
	case KPUBLIC:
	  fputs ("/* public: */", stdout);
	  goto acspec_clear;
	case KPROTECTED:
	  fputs ("/* protected: */", stdout);
	  goto acspec_clear;
	case KPRIVATE:
	  fputs ("/* private: */", stdout);
	  goto acspec_clear;
	}
	goto no_acspec;

      acspec_clear:
	TS_QUEUE_DROP; TS_QUEUE_DROP;
	if (nt == pa+2) {
	  TS_QUEUE_DROP;
	}
	continue;
      no_acspec:
	;
      }

      if (nt_type == '(')
	;/* Currently, there is no special handling for function
	    calls.  */
    }

    /* The remaining checks only require two tokens on the
       stack.  */

    /* The remaining checks only require one token on the stack.  */
  one_token:

    if (!typedef_stmt && !in_command && !in_decl && !very_likely_decl) {
      if ((token_stack.d[pa+0].type >= KIF &&
	   token_stack.d[pa+0].type <= KGOTO) ||
	  token_stack.d[pa+0].type == KNEW ||
	  token_stack.d[pa+0].type == KDELETE) {
	in_command = true;
	TS_QUEUE_OUT;
	continue;
      }

      if (token_stack.d[pa+0].type == KTYPEDEF) {
	typedef_stmt = true;
	pa++;
	continue;
      }

      if (is_type_ident (&token_stack.d[pa+0])) {
	in_decl = true;
	continue;
      }

      if (token_stack.d[pa+0].type == K_INCLUDE) {
	/* Replace `#include' with `import' and remove extension from
	   included file.  */
      }

      if (token_stack.d[pa+0].type >= K_IFDEF &&
	  token_stack.d[pa+0].type <= K_PRAGMA) {
	in_command = true; /* Let's just do this for now... */
	TS_QUEUE_OUT;
	continue;
      }
    }

    /* Semicolons only perform a special action if they end a
       statement on the same parenthetical nesting level that it began
       on.  */
    if (token_stack.d[pa+0].type == ';' &&
	!memcmp (&levels, &pre_param_level, sizeof(NestLevel))) {
      bool drop_semicolon = false;

      /* Emit any pending declaration.  */
      if (in_decl || very_likely_decl) {

	/* FIXME: Cheap heuristic to eliminate function prototypes
	   from the input code.  Unfortunately, this can also
	   eliminate global C++ objects with a class constructor.  */
	if (levels.brace == 0 &&
	    ((pa >= 1 && token_stack.d[pa-1].type == ')') ||
	     (pa >= 2 && IS_SEM_SPACE(token_stack.d[pa-1].type) &&
	      token_stack.d[pa-2].type == ')'))) {
	  DISCARD_PA_STACK;
	  TS_QUEUE_DROP; /* Drop the ';' */

	  /* If the next token is a newline, then drop that too.  */
	  if (token_stack.len == 0)
	    continue;
	  if (token_stack.d[0].type == '\n') {
	    TS_QUEUE_DROP;
	  } else {
	    if (IS_SEM_SPACE(token_stack.d[0].type) &&
		token_stack.d[0].val[0] == '\n') {
	      /* Delete the newline character at the beginning of the
		 string.  */
	      char *str = token_stack.d[0].val;
	      while (*str != '\0')
		*str++ = str[0];
	    }
	  }
	  continue;

	} else { /* Process a variable declaration.  */
	  unsigned real_pa = pa;
	  fputs ("var ", stdout);
	  pa = last_decl_ident;
	  DISCARD_PA_STACK; /* Throw away the type information.  */
	  pa = real_pa - last_decl_ident;
	  TS_QUEUE_OUT; /* Write the identifer name at last_decl_ident.  */
	  EMIT_PA_STACK;
	}
      }

      /* Pickup any pending typedef.  */
      if (typedef_stmt) {
	EA_APPEND (type_idents, xstrdup (token_stack.d[pa+2].val));
	/* Do not emit the typedef.  */
	drop_semicolon = true;
      }

      DISCARD_PA_STACK;
      typedef_stmt = false;
      last_typedef_ident = 0;
      in_decl = false;
      very_likely_decl = false;
      last_decl_ident = 0;
      in_command = false;
      if (!drop_semicolon) {
	TS_QUEUE_OUT;
      } else {
	TS_QUEUE_DROP;
      }
      continue;
    }

    if (token_stack.d[pa+0].type == '{') {
      levels.brace++;
      pre_param_level.brace++;

      /* Emit any pending function declaration.  */
      if (in_decl || very_likely_decl) {
	unsigned real_pa = pa;
	fputs ("function ", stdout);
	pa = last_decl_ident;
	DISCARD_PA_STACK; /* Throw away the return type information.  */
	pa = real_pa - last_decl_ident;
	TS_QUEUE_OUT; /* Write the identifer name at last_decl_ident.  */

	/* Reparse the remaining saved tokens to eliminate type
	   information and default argument values from the parameter
	   list.  */

	/* Skip until the first parenthesis.  */
	while (pa > 0) {
	  if (token_stack.d[0].type == '(') {
	    TS_QUEUE_OUT;
	    levels.paren++;
	    break;
	  }
	  TS_QUEUE_OUT;
	}

	{ /* Parse arguments until the last parenthesis.  */
	  unsigned subpa = 0; /* Sub Parse Anchor */
	  bool def_arg_val_found = false;
	  last_decl_ident = 0;
	  while (pa > 0 && levels.paren != pre_param_level.paren) {
	    bool writeout_arg = false;

	    if (IS_TYPE_IDENT_FAST(token_stack.d[subpa].type))
	      last_decl_ident = subpa;

	    switch (token_stack.d[subpa].type) {
	    case IDENT: last_decl_ident = subpa; break;

	    case '=':
	      if (levels.paren == pre_param_level.paren + 1 &&
		  levels.bracket == pre_param_level.bracket) {
		def_arg_val_found = true;
		/* Write out a variable declaration.  */
		fputs (token_stack.d[last_decl_ident].val, stdout);

		/* Discard everything up to and including this equal
		   sign.  */
		while (subpa > 0)
		  { TS_QUEUE_DROP; subpa--; }
		TS_QUEUE_DROP; /* Drop '=' */

		/* `def_arg_val_found' will trigger discarding
		   everything after the equal sign when ',' or a
		   terminating ')' is found.  */

		continue; /* Skip subpa++ */
	      }
	      break;

	    case ',':
	      if (levels.paren == pre_param_level.paren + 1 &&
		  levels.bracket == pre_param_level.bracket) {
		writeout_arg = true;
	      }
	      break;

	    case '(': levels.paren++; break;
	    case ')': levels.paren--;
	      if (levels.paren == pre_param_level.paren &&
		  levels.bracket == pre_param_level.bracket) {
		writeout_arg = true;
	      }
	      break;
	    case '[': levels.bracket++; break;
	    case ']': levels.bracket--; break;
	    }

	    if (writeout_arg) {
	      if (!def_arg_val_found) {
		/* Write out a variable declaration, but only if this
		   is not simply `void' in parentheses.  */
		if (!(!strcmp(token_stack.d[last_decl_ident].val, "void") &&
		      token_stack.d[subpa].type == ')'))
		  fputs (token_stack.d[last_decl_ident].val, stdout);
		subpa = last_decl_ident + 1;
		while (subpa > 0)
		  { TS_QUEUE_DROP; subpa--; }
		/* Write out semantic space before ',' or ')' but
		   after the variable name.  */
		if (IS_SEM_SPACE(token_stack.d[0].type))
		  { TS_QUEUE_OUT; }
		TS_QUEUE_OUT; /* Write ',' or ')' */
		/* Write whitespace that immediately follows.  */
		if (IS_SEM_SPACE(token_stack.d[0].type))
		  { TS_QUEUE_OUT; }

	      } else {
		def_arg_val_found = false;
		/* Drop all tokens that were found in between.  */
		while (subpa > 0)
		  { TS_QUEUE_DROP; subpa--; }
		TS_QUEUE_OUT; /* Write ',' */
		/* Write whitespace that immediately follows.  */
		if (IS_SEM_SPACE(token_stack.d[0].type))
		  { TS_QUEUE_OUT; }
	      }

	      continue; /* Skip subpa++ */
	    }

	    subpa++;
	  }

	  if (def_arg_val_found) {
	    /* Drop all tokens that were found before the ')'.  */
	    while (subpa > 1)
	      { TS_QUEUE_DROP; subpa--; }
	  }

	  /* Write out any remaining tokens up to and including the
	     ')'.  */
	  while (subpa > 0)
	    { TS_QUEUE_OUT; subpa--; }
	}

	/* Just pass through any remaining tokens before the '}'.  */
	EMIT_PA_STACK;
      }

      /* In C/C++, there will never be multiple brace groupings within
	 a single statement.  But in a language like JavaScript, a
	 recursive parser invocation would be needed at this step.  */
      DISCARD_PA_STACK;
      typedef_stmt = false;
      last_typedef_ident = 0;
      in_decl = false;
      very_likely_decl = false;
      last_decl_ident = 0;
      in_command = false;
      TS_QUEUE_OUT;
      continue;
    } if (token_stack.d[pa+0].type == '}' &&
	  !memcmp (&levels, &pre_param_level, sizeof(NestLevel))) {
      levels.brace--;
      pre_param_level.brace--;
      if (levels.brace < 0)
	{ PAREN_ERROR ('}'); }
      TS_QUEUE_OUT;
      continue;
    }

    /* These are just parenthetical counters.  Actual handling of the
       characters is delegated to other functions.  */
    if (token_stack.d[pa+0].type == '(') {
      levels.paren++;
    } if (token_stack.d[pa+0].type == ')') {
      levels.paren--;
      if (levels.paren < 0)
	{ PAREN_ERROR (')'); }
    }
    if (token_stack.d[pa+0].type == '[') {
      levels.bracket++;
    } if (token_stack.d[pa+0].type == ']') {
      levels.bracket--;
      if (levels.bracket < 0)
	{ PAREN_ERROR (']'); }
    }

    if (in_decl || very_likely_decl) {
      /* Only update the last identifier if it is not in a
	 parenthetical subexpression.  */
      if (!memcmp (&levels, &pre_param_level, sizeof(NestLevel))) {

	if (token_stack.d[pa+0].type == IDENT)
	  last_decl_ident = pa;

	else if (token_stack.d[pa+0].type == '=') {
	  /* Write out the var keyword at this point and treat the
	     rest of the line as a command.  */
	  unsigned real_pa = pa;
	  fputs ("var ", stdout);
	  pa = last_decl_ident;
	  DISCARD_PA_STACK; /* Throw away the type information.  */
	  pa = real_pa - last_decl_ident;
	  TS_QUEUE_OUT; /* Write the identifer name at last_decl_ident.  */
	  EMIT_PA_STACK;

	  /* FIXME: We still need to augment processing here to get
	     rid of pointer asterisks.  */

	  in_decl = false;
	  very_likely_decl = false;
	  in_command = true;
	  TS_QUEUE_OUT;
	  continue;
	}
      }

      /* Keep pushing miscellaneous tokens.  */
      pa++;
      continue;
    }

    if (typedef_stmt) {
      if (token_stack.d[pa+0].type == IDENT)
	last_typedef_ident = pa;
      /* Keep pushing.  */
      pa++;
      continue;
    }

    /* if (in_command) "Nothing special, just fall through."; */

    /* None of the above checks yielded a special action.  Empty the
       token from the front of the queue.  */
  no_tokens:
    TS_QUEUE_OUT;
  }

  EMPTY_TOKEN_STACK;

  retval = 0;

 cleanup:
  {
    unsigned i;
    for (i = 0; i < token_stack.len; i++)
      xfree (token_stack.d[i].val);
    EA_DESTROY(token_stack);
    for (i = 0; i < type_idents.len; i++)
      xfree (type_idents.d[i]);
    EA_DESTROY(type_idents);
  }
  return retval;
}

/********************************************************************/
/* Epilogue */

#include <ctype.h>

int
yylex (void) {
  int c = getchar ();
  EA_CLEAR(yylval);

  /* Step.  */
  yylloc.first_line = yylloc.last_line;
  yylloc.first_column = yylloc.last_column;

  /* Return end-of-input.  */
  if (c == EOF)
    return 0;

  /* Parse tabs and spaces as whitespace tokens.  */
  if (c == ' ' || c == '\t') {
    ++yylloc.last_column;
    EA_APPEND (yylval, c);
    while ((c = getchar ()) == ' ' || c == '\t') {
      ++yylloc.last_column;
      EA_APPEND (yylval, c);
    }
    ungetc (c, stdin);
    EA_APPEND (yylval, '\0');
    return WHITESPACE;
  }

  /* Parse comments as tokens.  */
  if (c == '/') {
    ++yylloc.last_column;
    EA_APPEND (yylval, c);
    c = getchar ();

    if (c == '*') {
      ++yylloc.last_column;
      EA_APPEND (yylval, c);
      /* Block comment.  */
      while ((c = getchar ()) != EOF) {
	++yylloc.last_column;
	EA_APPEND (yylval, c);
	if (c == '*') {
	  c = getchar ();
	  if (c == EOF)
	    break;
	  if (c == '/') {
	    ++yylloc.last_column;
	    EA_APPEND (yylval, c);
	    EA_APPEND (yylval, '\0');
	    return BLOCK_COMMENT;
	  } else
	    ungetc (c, stdin);
	} else if (c == '\n') {
	  ++yylloc.last_line;
	  yylloc.last_column = 0;
	}
      }
      if (c == EOF) {
	/* Return as much of the block comment as has been
	   retrieved.  */
	EA_APPEND (yylval, '\0');
	return BLOCK_COMMENT;
      }

    } else if (c == '/') {
      ++yylloc.last_column;
      EA_APPEND (yylval, c);
      /* Line comment.  */
      while ((c = getchar ()) != EOF) {
	++yylloc.last_column;
	EA_APPEND (yylval, c);
	if (c == '\n') {
	  ++yylloc.last_line;
	  yylloc.last_column = 0;
	  EA_APPEND (yylval, '\0');
	  return LINE_COMMENT;
	}
      }
      if (c == EOF) {
	/* Return as much of the line comment as has been
	   retrieved.  */
	EA_APPEND (yylval, '\0');
	return LINE_COMMENT;
      }

    } else {
      ungetc (c, stdin);
      EA_APPEND (yylval, '\0');
      return '/'; /* Just a '/' character.  */
    }
  }

  /* Process string literals.  */
  if (c == '"' || c == '\'') {
    ++yylloc.last_column;
    EA_APPEND (yylval, c);
    while ((c = getchar ()) != EOF) {
      ++yylloc.last_column;
      EA_APPEND (yylval, c);
      switch (c) {
      case '\\':
	c = getchar ();
	if (c != EOF) {
	  ++yylloc.last_column;
	  EA_APPEND (yylval, c);
	  if (c == '\n') {
	    ++yylloc.last_line;
	    yylloc.last_column = 0;
	  }
	}
	break;
      case '"':
	if (yylval.d[0] == '"') {
	  EA_APPEND (yylval, '\0');
	  return STR_LIT;
	}
	break;
      case '\'':
	if (yylval.d[0] == '\'') {
	  EA_APPEND (yylval, '\0');
	  return CHAR_LIT;
	}
	break;
      case '\n':
	/* Technically, this is an error, but return as much of the
	   unterminated string literal as possible.  */
	ungetc (c, stdin);
	EA_POP_BACK (yylval);
	EA_APPEND (yylval, '\0');
	if (yylval.d[0] == '"')
	  return STR_LIT;
	else
	  return CHAR_LIT;
      }
    }
    if (c == EOF) {
      /* Technically, this is an error, but return as much of the
	 unterminated string literal as possible.  */
      EA_APPEND (yylval, '\0');
	if (yylval.d[0] == '"')
	  return STR_LIT;
	else
	  return CHAR_LIT;
    }
  }

  /* Process numeric literals.  */
  if (isdigit (c)) {
    ++yylloc.last_column;
    EA_APPEND (yylval, c);
    while (isdigit (c = getchar ())) {
      ++yylloc.last_column;
      EA_APPEND (yylval, c);
    }
    ungetc (c, stdin);
    EA_APPEND (yylval, '\0');
    return NUM_LIT;
  }

  /* Read an alphanumeric token.  */
  if (isalnum (c) || c == '_') {
    ++yylloc.last_column;
    EA_APPEND (yylval, c);
    while ((c = getchar ()) != EOF && (isalnum (c) || c == '_')) {
      ++yylloc.last_column;
      EA_APPEND (yylval, c);
    }
    ungetc (c, stdin);
    EA_APPEND (yylval, '\0');

    /* Process keywords.  */
    if (!strcmp (yylval.d, "int")) return KINT;
    else if (!strcmp (yylval.d, "char")) return KCHAR;
    else if (!strcmp (yylval.d, "float")) return KFLOAT;
    else if (!strcmp (yylval.d, "double")) return KDOUBLE;
    else if (!strcmp (yylval.d, "void")) return KVOID;
    else if (!strcmp (yylval.d, "long")) return KLONG;
    else if (!strcmp (yylval.d, "short")) return KSHORT;
    else if (!strcmp (yylval.d, "unsigned")) return KUNSIGNED;
    else if (!strcmp (yylval.d, "signed")) return KSIGNED;
    else if (!strcmp (yylval.d, "const")) return KCONST;
    else if (!strcmp (yylval.d, "bool")) return KBOOL;
    else if (!strcmp (yylval.d, "static")) return KSTATIC;
    else if (!strcmp (yylval.d, "sizeof")) return KSIZEOF;
    else if (!strcmp (yylval.d, "typedef")) return KTYPEDEF;

    else if (!strcmp (yylval.d, "if")) return KIF;
    else if (!strcmp (yylval.d, "else")) return KELSE;
    else if (!strcmp (yylval.d, "while")) return KWHILE;
    else if (!strcmp (yylval.d, "do")) return KDO;
    else if (!strcmp (yylval.d, "for")) return KFOR;
    else if (!strcmp (yylval.d, "break")) return KBREAK;
    else if (!strcmp (yylval.d, "continue")) return KCONTINUE;
    else if (!strcmp (yylval.d, "switch")) return KSWITCH;
    else if (!strcmp (yylval.d, "case")) return KCASE;
    else if (!strcmp (yylval.d, "default")) return KDEFAULT;
    else if (!strcmp (yylval.d, "return")) return KRETURN;
    else if (!strcmp (yylval.d, "goto")) return KGOTO;

    else if (!strcmp (yylval.d, "ifdef")) return K_MAYBE_IFDEF;
    else if (!strcmp (yylval.d, "ifndef")) return K_MAYBE_IFNDEF;
    else if (!strcmp (yylval.d, "endif")) return K_MAYBE_ENDIF;
    else if (!strcmp (yylval.d, "define")) return K_MAYBE_DEFINE;
    else if (!strcmp (yylval.d, "defined")) return K_MAYBE_DEFINED;
    else if (!strcmp (yylval.d, "include")) return K_MAYBE_INCLUDE;
    else if (!strcmp (yylval.d, "pragma")) return K_MAYBE_PRAGMA;

    else if (!strcmp (yylval.d, "struct")) return KSTRUCT;
    else if (!strcmp (yylval.d, "class")) return KCLASS;
    else if (!strcmp (yylval.d, "public")) return KPUBLIC;
    else if (!strcmp (yylval.d, "protected")) return KPROTECTED;
    else if (!strcmp (yylval.d, "private")) return KPRIVATE;

    else if (!strcmp (yylval.d, "friend")) return KFRIEND;
    else if (!strcmp (yylval.d, "virtual")) return KVIRTUAL;
    else if (!strcmp (yylval.d, "namespace")) return KNAMESPACE;
    else if (!strcmp (yylval.d, "using")) return KUSING;
    else if (!strcmp (yylval.d, "new")) return KNEW;
    else if (!strcmp (yylval.d, "delete")) return KDELETE;

    else if (!strcmp (yylval.d, "boolean")) return KBOOLEAN;
    else if (!strcmp (yylval.d, "extends")) return KEXTENDS;
    else if (!strcmp (yylval.d, "implements")) return KIMPLEMENTS;
    else if (!strcmp (yylval.d, "final")) return KFINAL;
    else if (!strcmp (yylval.d, "package")) return KPACKAGE;

    else if (!strcmp (yylval.d, "function")) return KFUNCTION;
    else if (!strcmp (yylval.d, "var")) return KVAR;

    /* Process identifiers.  */
    else return IDENT;
  }

  /* Read a miscellaneous character.  */
  if (c == '\n') {
    ++yylloc.last_line;
    yylloc.last_column = 0;
  } else
    ++yylloc.last_column;
  EA_APPEND (yylval, c);
  EA_APPEND (yylval, '\0');
  return c;
}

/* Called by yyparse on error.  */
void
yyerror (char const *s) {
  fprintf (stderr, "stdin:%d:%d: %s\n",
	   yylloc.first_line, yylloc.first_column, s);
}

int
main (void) {
  int retval;
  yylloc.first_line = yylloc.last_line = 1;
  yylloc.first_column = yylloc.last_column = 0;
  EA_INIT (char, yylval, 128);
  retval = yyparse ();
  EA_DESTROY (yylval);
  return retval;
}
