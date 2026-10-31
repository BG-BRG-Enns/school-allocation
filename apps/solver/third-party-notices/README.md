# Third-party notices: the solver image

What the solver image carries besides this repository's own code. The image carries this directory as `/app/third-party-notices`.

The image's Python packages are those `uv.lock` names outside the dev group. Each wheel carries its own licence in its `*.dist-info` directory under `/usr/local/lib/python3.13/site-packages`, and most contain nothing but their own code. Three contain code of other projects as well: OR-Tools, for which this page gives the notice its wheel does not carry, numpy, whose wheel carries its own, and pydantic-core.

## OR-Tools

OR-Tools 9.15.6755 is under the Apache License 2.0 ([Apache-2.0.txt](Apache-2.0.txt)), and its wheel carries that licence alone. Its shared libraries (`ortools/.libs`), its extension modules and the package `pybind11_abseil` beside it contain these libraries as well, at the versions OR-Tools pins for the release in [`Dependencies.txt`](https://github.com/google/or-tools/blob/v9.15/Dependencies.txt):

| Library | Version | Licence | In the image |
| ------- | ------- | ------- | ------------ |
| [Abseil](https://github.com/abseil/abseil-cpp/tree/20250814.1) | 20250814.1 | Apache-2.0 ([Apache-2.0.txt](Apache-2.0.txt)) | `ortools/.libs/libabsl_*` |
| [Protocol Buffers](https://github.com/protocolbuffers/protobuf/tree/v33.1) | 33.1 | BSD-3-Clause ([BSD-3-Clause-protobuf.txt](BSD-3-Clause-protobuf.txt)) | `libprotobuf`, `libutf8_validity` |
| [RE2](https://github.com/google/re2/tree/2025-08-12) | 2025-08-12 | BSD-3-Clause ([BSD-3-Clause-re2.txt](BSD-3-Clause-re2.txt)) | `libre2` |
| [Eigen](https://gitlab.com/libeigen/eigen/-/tree/3.4.0) | 3.4.0 | MPL-2.0 ([MPL-2.0.txt](MPL-2.0.txt)) | compiled into `libortools` (a header-only library) |
| [CoinUtils](https://github.com/coin-or/CoinUtils/tree/releases/2.11.12) | 2.11.12 | EPL-2.0 ([EPL-2.0.txt](EPL-2.0.txt)) | `libCoinUtils` |
| [Osi](https://github.com/coin-or/Osi/tree/releases/0.108.11) | 0.108.11 | EPL-2.0 | `libOsi`, `libOsiClp`, `libOsiCbc` |
| [Clp](https://github.com/coin-or/Clp/tree/releases/1.17.10) | 1.17.10 | EPL-2.0 | `libClp`, `libClpSolver` |
| [Cgl](https://github.com/coin-or/Cgl/tree/releases/0.60.9) | 0.60.9 | EPL-2.0 | `libCgl` |
| [Cbc](https://github.com/coin-or/Cbc/tree/releases/2.10.12) | 2.10.12 | EPL-2.0 | `libCbc`, `libCbcSolver` |
| [HiGHS](https://github.com/ERGO-Code/HiGHS/tree/v1.12.0) | 1.12.0 | MIT ([MIT-HiGHS.txt](MIT-HiGHS.txt)) | `libhighs` |
| [SCIP](https://github.com/scipopt/scip/tree/v10.0.0) | 10.0.0 | Apache-2.0 | `libscip` |
| [SoPlex](https://github.com/scipopt/soplex/tree/v8.0.0) | 8.0.0 | Apache-2.0 | linked into `libscip` |
| [zlib](https://github.com/madler/zlib/tree/v1.3.1) | 1.3.1 | Zlib ([Zlib.txt](Zlib.txt)) | `libz` |
| [bzip2](https://gitlab.com/bzip2/bzip2) | 1.1.0, from its default branch, which OR-Tools fetches | bzip2 licence ([bzip2.txt](bzip2.txt)) | `libbz2` |
| [pybind11](https://github.com/pybind/pybind11/tree/v2.13.6) | 2.13.6 | BSD-3-Clause ([BSD-3-Clause-pybind11.txt](BSD-3-Clause-pybind11.txt)) | the extension modules |
| [pybind11_abseil](https://github.com/pybind/pybind11_abseil/tree/v202402.0) | 202402.0 | BSD-3-Clause ([BSD-3-Clause-pybind11_abseil-pybind11_protobuf.txt](BSD-3-Clause-pybind11_abseil-pybind11_protobuf.txt)) | the package `pybind11_abseil` |
| [pybind11_protobuf](https://github.com/pybind/pybind11_protobuf/tree/84653a591aea5df482dc2bde42c19efafbd53a57) | `84653a5` | BSD-3-Clause (the same file) | the extension modules |

OR-Tools builds each of them with the patch of the same name in its [`patches/`](https://github.com/google/or-tools/tree/v9.15/patches) directory at the tag `v9.15`, so the source of what the image carries is the project's source at the version above together with that patch. That is the source the MPL-2.0 (Eigen) and the EPL-2.0 (the COIN-OR libraries) ask a distribution in executable form to point to. OR-Tools' release pins GLPK too; its wheel contains no GLPK code.

## numpy

numpy 2.5.4 bundles OpenBLAS and LAPACK (BSD-3-Clause), the GCC runtime library `libgfortran` (GPL-3.0-or-later with the GCC Runtime Library Exception 3.1) and `libquadmath` (LGPL-2.1-or-later), as shared libraries in `numpy.libs`. Its wheel carries the notice for each, with where its source is, in `numpy-2.5.4.dist-info/licenses/LICENSE.txt`.

## pydantic-core

pydantic-core 2.50.2 is under the MIT licence, which its wheel carries. Its extension module, `pydantic_core/_pydantic_core.cpython-313-x86_64-linux-gnu.so`, is compiled from Rust and links crates its lock file names: [`pydantic-core/Cargo.lock` at pydantic's tag `v2.14.2`](https://github.com/pydantic/pydantic/blob/v2.14.2/pydantic-core/Cargo.lock), the release that carries this version, which also names crates for other platforms and for the build alone. As crates.io lists them, all 101 are under permissive licences:

- MIT, Apache-2.0, or a choice between the two, for most;
- Unicode-3.0 for the ICU4X crates (`icu_*`, `zerovec`, `yoke`, `tinystr`, `litemap`, `writeable`, `zerofrom` and their derive crates), and Unicode-DFS-2016 beside MIT or Apache-2.0 for `unicode-ident`;
- Zlib for `foldhash`, and BSD-2-Clause as a third choice for `zerocopy`;
- `r-efi`, a crate for UEFI targets only, offers LGPL-2.1-or-later beside MIT and Apache-2.0.

Each crate's licence text is in its source, which crates.io keeps at the version the lock file names.

## The base image

The image is built on `docker.io/library/python` (Debian). Its operating-system packages carry their copyright files from upstream, one per package under `/usr/share/doc`; nothing is added here.
