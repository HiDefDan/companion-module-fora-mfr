#!/usr/bin/env bash
# Checks that every non-merge commit in a git revision range follows
# Conventional Commits (https://www.conventionalcommits.org/en/v1.0.0/).
#
# Usage: .github/scripts/check-commit-messages.sh <base>..<head>
set -euo pipefail

range="${1:?usage: $0 <base>..<head>}"

types='feat|fix|refactor|perf|test|docs|chore|ci|build'
# type, optional (scope), optional ! for a breaking change, then ": description"
header="^($types)(\([^()[:space:]]+\))?!?: [^[:space:]]"
# Dependabot ("Bump x from 1.0.0 to 1.0.1", "Bump the npm group ...") and git reverts
exempt='^(Bump [^[:space:]]+ from [^[:space:]]+ to [^[:space:]]+|Bump the [^[:space:]]+ group|Revert ".+")'

failed=0
for sha in $(git rev-list --no-merges --reverse "$range"); do
	message="$(git log -1 --format=%B "$sha")"
	subject="$(head -n 1 <<<"$message")"
	short="$(git rev-parse --short "$sha")"
	errors=()

	if [[ "$subject" =~ $exempt ]]; then
		continue
	fi
	if ! [[ "$subject" =~ $header ]]; then
		errors+=("the subject must be '<type>[(scope)][!]: <description>' with a type of ${types//|/, }")
	fi
	if [[ -n "$(sed -n 2p <<<"$message")" ]]; then
		errors+=("the subject must be followed by a blank line")
	fi
	# A breaking change footer must be spelt "BREAKING CHANGE: " or "BREAKING-CHANGE: "
	while IFS= read -r line; do
		if ! [[ "$line" =~ ^BREAKING[\ -]CHANGE:\ [^[:space:]] ]]; then
			errors+=("write the breaking change footer as 'BREAKING CHANGE: <description>', not '$line'")
		fi
	done < <(tail -n +2 <<<"$message" | grep -iE '^breaking[ -]?changes?[[:space:]]*:' || true)

	if ((${#errors[@]})); then
		failed=1
		echo "::error::$short \"$subject\""
		printf '  - %s\n' "${errors[@]}"
	fi
done

if ((failed)); then
	echo
	echo "See the Contributing section of README.md."
	exit 1
fi
echo "All commit messages in $range follow Conventional Commits."
